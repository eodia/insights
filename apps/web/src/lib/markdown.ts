/**
 * A model's Markdown with its code blocks closed where they end: a model often glues its next
 * sentence to the closing fence (« ```J'ai ajouté… »), and Markdown then reads everything after
 * as code. The fence goes on its own line, the sentence after it.
 */
export function tidyFences(text: string): string {
  const out: string[] = []
  let open = false
  for (const line of text.split('\n')) {
    if (!open) {
      if (/^\s*```/.test(line)) open = true
      out.push(line)
      continue
    }
    const at = line.indexOf('```')
    if (at === -1) {
      out.push(line)
      continue
    }
    const before = line.slice(0, at)
    const after = line.slice(at + 3)
    if (before.trim()) out.push(before)
    out.push('```')
    open = false
    if (after.trim()) out.push('', after.trimStart())
  }
  return out.join('\n')
}
