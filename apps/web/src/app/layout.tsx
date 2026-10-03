import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.EODIA_PUBLIC_URL ||
      (process.env.EODIA_DOMAIN ? `https://${process.env.EODIA_DOMAIN}` : 'http://localhost:3100'),
  ),
  title: { default: 'eodia insights', template: '%s · eodia insights' },
  description: 'Tableaux de bord, questions et exploration de données, open source.',
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'eodia insights',
    title: 'eodia insights — Vos données prennent du sens.',
    description:
      'Explorez vos données, posez vos questions et partagez vos tableaux de bord. Open source, avec un copilot IA.',
  },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/favicon.svg' },
}

/** The theme is set before the first paint: no flash of the wrong one. */
const THEME = `try{var t=localStorage.getItem('eodia-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant script, the theme before paint */}
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
