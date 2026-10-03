import type { NextConfig } from 'next'

/**
 * Le front ne parle qu'HTTP : `/api/*` est relayé vers l'API (même origine pour les cookies).
 * Il ne dépend jamais de `@eodia/core` — aucune action serveur n'ouvre de connexion aux données.
 */
const API = process.env.EODIA_API_URL ?? 'http://localhost:4100'

const config: NextConfig = {
  transpilePackages: ['@eodia/contracts'],
  devIndicators: { position: 'bottom-right' },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]
  },
  // A shared item may be framed only with `?embed=1` (the page checks the link allows it).
  async headers() {
    return ['/q/:token', '/d/:token'].map((source) => ({
      source,
      missing: [{ type: 'query' as const, key: 'embed', value: '1' }],
      headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }],
    }))
  },
}

export default config
