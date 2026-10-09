/**
 * Fournisseurs de modèles. Le format canonique d'une conversation est celui de l'API Messages
 * d'Anthropic (blocs de contenu) ; l'adaptateur compatible OpenAI (OpenAI, Mistral, serveurs
 * compatibles) le traduit à l'aller et au retour.
 */
import Anthropic from '@anthropic-ai/sdk'
import { Agent, fetch as undiciFetch } from 'undici'
import type { Config } from '../config'

/** One pool of connections that accepts any certificate, made the first time it is needed. */
let unverified: Agent | undefined

/**
 * How the provider is reached: Node's own fetch, or — `AI_PROVIDER_SSL_VERIFY=false` — one that
 * accepts any certificate. Only the provider's calls: Trino, the identity provider and the mail
 * server keep checking theirs.
 */
function fetchFor(config: Config['ai']): typeof fetch {
  if (config.sslVerify) return fetch
  unverified ??= new Agent({ connect: { rejectUnauthorized: false } })
  const dispatcher = unverified
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher })) as unknown as typeof fetch
}

export type MessageParam = Anthropic.Beta.BetaMessageParam
export type ContentBlock = Anthropic.Beta.BetaContentBlockParam

export interface ToolSpec {
  readonly name: string
  readonly description: string
  readonly input_schema: Record<string, unknown>
}

export interface TurnResult {
  readonly content: ContentBlock[]
  readonly stopReason: string
  readonly usage: { readonly input: number; readonly output: number }
}

export interface Provider {
  readonly name: string
  readonly model: string
  turn(opts: {
    system: string
    tools: readonly ToolSpec[]
    messages: readonly MessageParam[]
    onText: (delta: string) => void
    signal?: AbortSignal
  }): Promise<TurnResult>
}

// ── Anthropic ───────────────────────────────────────────────────────────────

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1'])

class AnthropicProvider implements Provider {
  readonly name = 'anthropic'
  private readonly client: Anthropic

  constructor(
    readonly model: string,
    apiKey: string,
    baseURL: string | undefined,
    fetcher: typeof fetch,
  ) {
    this.client = new Anthropic({ apiKey, fetch: fetcher, ...(baseURL ? { baseURL } : {}) })
  }

  async turn(opts: Parameters<Provider['turn']>[0]): Promise<TurnResult> {
    const fallback = FALLBACK_MODELS.has(this.model)
    const stream = this.client.beta.messages.stream(
      {
        model: this.model,
        max_tokens: 16000,
        // Frozen system prompt, cached: the volatile context travels in the messages.
        system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
        tools: opts.tools.map((t) => ({ ...t, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema, eager_input_streaming: true })),
        messages: opts.messages as MessageParam[],
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      opts.signal ? { signal: opts.signal } : undefined,
    )
    stream.on('text', (delta) => opts.onText(delta))
    const message = await stream.finalMessage()
    return {
      content: message.content as unknown as ContentBlock[],
      stopReason: message.stop_reason ?? 'end_turn',
      usage: { input: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0), output: message.usage.output_tokens },
    }
  }
}

// ── Compatible OpenAI ───────────────────────────────────────────────────────

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

function toOpenAi(system: string, messages: readonly MessageParam[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content } as ContentBlock] : (m.content as ContentBlock[])
    if (m.role === 'assistant') {
      const text = blocks.filter((b): b is Anthropic.Beta.BetaTextBlockParam => b.type === 'text').map((b) => b.text).join('')
      const calls = blocks
        .filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === 'tool_use')
        .map((b) => ({ id: b.id, type: 'function' as const, function: { name: b.name, arguments: JSON.stringify(b.input) } }))
      out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) })
    } else {
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          const content = typeof b.content === 'string' ? b.content : (b.content ?? []).map((c) => ('text' in c ? c.text : '')).join('')
          out.push({ role: 'tool', tool_call_id: b.tool_use_id, content })
        } else if (b.type === 'text') out.push({ role: 'user', content: b.text })
      }
    }
  }
  return out
}

class OpenAiCompatibleProvider implements Provider {
  constructor(
    readonly name: string,
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch,
  ) {}

  async turn(opts: Parameters<Provider['turn']>[0]): Promise<TurnResult> {
    const res = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        stream_options: { include_usage: true },
        messages: toOpenAi(opts.system, opts.messages),
        tools: opts.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
    if (!res.ok || !res.body) throw new Error(`Le fournisseur ${this.name} a répondu ${res.status} : ${(await res.text()).slice(0, 300)}`)
    let text = ''
    const calls = new Map<number, { id: string; name: string; args: string }>()
    let usage = { input: 0, output: 0 }
    let finish = 'stop'
    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true })
      let nl = buffer.indexOf('\n')
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        nl = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') continue
        const event = JSON.parse(data) as {
          choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[]
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        const choice = event.choices?.[0]
        if (choice?.delta?.content) {
          text += choice.delta.content
          opts.onText(choice.delta.content)
        }
        for (const tc of choice?.delta?.tool_calls ?? []) {
          const cur = calls.get(tc.index) ?? { id: tc.id ?? `call_${tc.index}`, name: '', args: '' }
          if (tc.id) cur.id = tc.id
          if (tc.function?.name) cur.name += tc.function.name
          if (tc.function?.arguments) cur.args += tc.function.arguments
          calls.set(tc.index, cur)
        }
        if (choice?.finish_reason) finish = choice.finish_reason
        if (event.usage) usage = { input: event.usage.prompt_tokens ?? 0, output: event.usage.completion_tokens ?? 0 }
      }
    }
    const content: ContentBlock[] = []
    if (text) content.push({ type: 'text', text })
    for (const c of calls.values()) {
      let input: unknown = {}
      try {
        input = c.args ? JSON.parse(c.args) : {}
      } catch {
        input = { INVALID_JSON: c.args }
      }
      content.push({ type: 'tool_use', id: c.id, name: c.name, input })
    }
    return { content, stopReason: calls.size > 0 ? 'tool_use' : finish === 'length' ? 'max_tokens' : 'end_turn', usage }
  }
}

export function providerFor(config: Config['ai']): Provider | null {
  if (config.provider === 'none' || !config.apiKey) return null
  const fetcher = fetchFor(config)
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config.model, config.apiKey, config.baseUrl, fetcher)
    case 'openai':
      return new OpenAiCompatibleProvider('openai', config.model, config.apiKey, config.baseUrl ?? 'https://api.openai.com/v1', fetcher)
    case 'mistral':
      return new OpenAiCompatibleProvider('mistral', config.model, config.apiKey, config.baseUrl ?? 'https://api.mistral.ai/v1', fetcher)
    case 'openai-compatible':
      if (!config.baseUrl) return null
      return new OpenAiCompatibleProvider('openai-compatible', config.model, config.apiKey, config.baseUrl, fetcher)
  }
}
