/**
 * Posting to a channel — Microsoft Teams (a Workflows webhook) or Slack (an incoming webhook) —
 * and the files a post points to: a channel takes no attachment, it shows an image by its
 * address, so the picture of a dashboard is kept a month behind an address with a token.
 */
import type { ChannelKind, DeliveryChannel, SubscriptionInput } from '@eodia/contracts'
import type { Core } from '../context'
import { decrypt, encrypt, randomToken } from '../crypto'
import { invalid } from '../errors'

export interface Post {
  readonly title: string
  /** Lines of text: Markdown-light (`**bold**`), one per paragraph. */
  readonly lines: readonly string[]
  readonly link: { readonly url: string; readonly label: string }
  readonly image?: string
  /** A second button: the PDF. */
  readonly file?: { readonly url: string; readonly label: string }
}

function teamsPayload(post: Post) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          msteams: { width: 'Full' },
          body: [
            { type: 'TextBlock', text: post.title, weight: 'Bolder', size: 'Medium', wrap: true },
            ...post.lines.map((text) => ({ type: 'TextBlock', text, wrap: true, spacing: 'Small' })),
            ...(post.image ? [{ type: 'Image', url: post.image, size: 'Stretch', altText: post.title, selectAction: { type: 'Action.OpenUrl', url: post.link.url } }] : []),
          ],
          actions: [
            { type: 'Action.OpenUrl', title: post.link.label, url: post.link.url },
            ...(post.file ? [{ type: 'Action.OpenUrl', title: post.file.label, url: post.file.url }] : []),
          ],
        },
      },
    ],
  }
}

function slackPayload(post: Post) {
  const mrkdwn = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '*$1*')
  return {
    text: post.title,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: post.title.slice(0, 150), emoji: true } },
      ...(post.lines.length ? [{ type: 'section', text: { type: 'mrkdwn', text: mrkdwn(post.lines.join('\n')).slice(0, 2900) } }] : []),
      ...(post.image ? [{ type: 'image', image_url: post.image, alt_text: post.title.slice(0, 200) }] : []),
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: post.link.label }, url: post.link.url, style: 'primary' },
          ...(post.file ? [{ type: 'button', text: { type: 'plain_text', text: post.file.label }, url: post.file.url }] : []),
        ],
      },
    ],
  }
}

export async function postToChannel(kind: ChannelKind, url: string, post: Post): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(kind === 'teams' ? teamsPayload(post) : slackPayload(post)),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`${kind === 'teams' ? 'Teams' : 'Slack'} a refusé le message (${res.status}) : ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

/** Where a webhook may point: Teams' and Slack's own hosts — nothing inside the network. */
function checkWebhook(kind: ChannelKind, raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw invalid('Adresse de webhook invalide.')
  }
  const host = url.hostname.toLowerCase()
  const ok =
    url.protocol === 'https:' &&
    (kind === 'slack'
      ? host === 'hooks.slack.com'
      : host.endsWith('.logic.azure.com') || host.endsWith('.powerplatform.com') || host.endsWith('.webhook.office.com') || host.endsWith('.environment.api.powerplatform.com'))
  if (!ok) throw invalid(kind === 'slack' ? 'Un webhook Slack commence par https://hooks.slack.com/.' : 'Un webhook Teams est une adresse « Workflows » de Microsoft (https://…logic.azure.com/… ou …powerplatform.com/…).')
  return url.toString()
}

type ChannelInput = SubscriptionInput['channels'][number]

/** Replaces the channels of a subscription or an alert; a channel kept without its address keeps the old one. */
export async function saveChannels(core: Core, owner: { subscription: string } | { alert: string }, inputs: readonly ChannelInput[], client: Parameters<Core['db']['exec']>[2]): Promise<void> {
  const column = 'subscription' in owner ? 'subscription_id' : 'alert_id'
  const ownerId = 'subscription' in owner ? owner.subscription : owner.alert
  const existing = await core.db.many<{ id: string; kind: string; url_enc: Buffer }>(`SELECT id, kind, url_enc FROM delivery_channel WHERE ${column} = $1`, [ownerId], client)
  await core.db.exec(`DELETE FROM delivery_channel WHERE ${column} = $1`, [ownerId], client)
  for (const [position, c] of inputs.entries()) {
    const kept = c.id ? existing.find((e) => e.id === c.id && e.kind === c.kind) : undefined
    const url = c.url ? encrypt(core.config.secretKey, checkWebhook(c.kind, c.url)) : kept?.url_enc
    if (!url) throw invalid('Donnez l’adresse du webhook de chaque canal.')
    await core.db.exec(
      `INSERT INTO delivery_channel (${column}, kind, label, url_enc, position) VALUES ($1, $2, $3, $4, $5)`,
      [ownerId, c.kind, c.label.trim(), url, position],
      client,
    )
  }
}

export interface StoredChannel extends DeliveryChannel {
  readonly url: string
}

/** The channels of subscriptions or alerts, their addresses decrypted — never sent to a browser. */
export async function channelsOf(core: Core, column: 'subscription_id' | 'alert_id', ids: readonly string[]): Promise<Map<string, StoredChannel[]>> {
  const out = new Map<string, StoredChannel[]>()
  if (!ids.length) return out
  const rows = await core.db.many<{ id: string; owner: string; kind: ChannelKind; label: string; url_enc: Buffer }>(
    `SELECT id, ${column} AS owner, kind, label, url_enc FROM delivery_channel WHERE ${column} = ANY($1::uuid[]) ORDER BY position`,
    [ids],
  )
  for (const r of rows) {
    let url = ''
    try {
      url = decrypt(core.config.secretKey, r.url_enc)
    } catch {}
    out.set(r.owner, [...(out.get(r.owner) ?? []), { id: r.id, kind: r.kind, label: r.label, url }])
  }
  return out
}

/** Keeps a file a channel shows by its address; the address returned holds its token. */
export async function storeFile(core: Core, mime: string, data: Buffer): Promise<string> {
  const token = randomToken(24)
  const row = await core.db.one<{ id: string }>('INSERT INTO delivery_file (token, mime, data) VALUES ($1, $2, $3) RETURNING id', [token, mime, data])
  const ext = mime === 'application/pdf' ? 'pdf' : 'png'
  return `${core.config.publicUrl}/api/public/files/${row?.id}/${token}.${ext}`
}

export async function readFile(core: Core, id: string, token: string): Promise<{ mime: string; data: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const row = await core.db.one<{ token: string; mime: string; data: Buffer }>(
    `SELECT token, mime, data FROM delivery_file WHERE id = $1 AND created_at > now() - interval '31 days'`,
    [id],
  )
  if (!row || row.token !== token) return null
  return { mime: row.mime, data: row.data }
}
