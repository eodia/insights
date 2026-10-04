import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { I18nRoot } from '@/components/i18n-root'
import { msg } from '@/lib/i18n'
import { i18nScript, messagesOf, requestLocale, translate } from '@/lib/i18n-server'
import { Providers } from './providers'
import './globals.css'

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

const OG_LOCALES = { fr: 'fr_FR', en: 'en_US', es: 'es_ES' } as const

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale()
  const messages = await messagesOf(locale)
  const t = (french: string) => translate(messages, french)
  return {
    metadataBase: new URL(
      process.env.PUBLIC_URL ||
        (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : 'http://localhost:3100'),
    ),
    title: { default: 'eodia insights', template: '%s · eodia insights' },
    description: t(msg('Tableaux de bord, questions et exploration de données, open source.')),
    openGraph: {
      type: 'website',
      locale: OG_LOCALES[locale],
      siteName: 'eodia insights',
      title: `eodia insights — ${t(msg('Vos données prennent du sens.'))}`,
      description: t(
        msg('Explorez vos données, posez vos questions et partagez vos tableaux de bord. Open source, avec un copilot IA.'),
      ),
    },
    twitter: { card: 'summary_large_image' },
    icons: { icon: '/favicon.svg' },
  }
}

/** The theme is set before the first paint: no flash of the wrong one. */
const THEME = `try{var t=localStorage.getItem('eodia-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The reader's language, and its messages — before any script of the application runs.
  const locale = await requestLocale()
  const messages = await messagesOf(locale)
  return (
    <html lang={locale} suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script, the theme before paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the page's language, serialized as JSON with `<` escaped */}
        <script dangerouslySetInnerHTML={{ __html: i18nScript(locale, messages) }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <I18nRoot>{children}</I18nRoot>
        </Providers>
      </body>
    </html>
  )
}
