/** E-mails sortants (invitations). Sans SMTP configuré, rien ne part : le lien reste à copier. */
import type { Core } from './context'

let transport: { sendMail(m: Record<string, unknown>): Promise<unknown> } | null = null

export function mailEnabled(core: Core): boolean {
  return core.config.smtp !== undefined
}

export async function sendMail(core: Core, to: string, subject: string, text: string, html: string): Promise<boolean> {
  const smtp = core.config.smtp
  if (!smtp) return false
  if (!transport) {
    const nodemailer = await import('nodemailer')
    transport = nodemailer.createTransport(smtp.url)
  }
  await transport.sendMail({ from: smtp.from, to, subject, text, html })
  return true
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export async function sendInvitation(core: Core, input: { id: string; email: string; url: string; inviter: string }): Promise<boolean> {
  const subject = `${input.inviter} vous invite sur eodia insights`
  const text = `Bonjour,\n\n${input.inviter} vous invite à rejoindre eodia insights.\nCréez votre compte : ${input.url}\n\nLe lien est valable 7 jours.`
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#18181b">
    <h2 style="margin:0 0 16px">Rejoignez eodia insights</h2>
    <p>${escape(input.inviter)} vous invite à rejoindre l'espace d'analyse de votre organisation.</p>
    <p style="margin:24px 0"><a href="${escape(input.url)}" style="background:#2da31e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Créer mon compte</a></p>
    <p style="color:#71717a;font-size:13px">Le lien est valable 7 jours.</p></div>`
  const sent = await sendMail(core, input.email, subject, text, html)
  if (sent) await core.db.exec('UPDATE invitation SET emailed_at = now() WHERE id = $1', [input.id])
  return sent
}
