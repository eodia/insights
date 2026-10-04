'use client'

import { $t, intlLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Fragment, type ReactNode, useEffect, useRef } from 'react'
import styles from './login-stage.module.css'

/**
 * The application, drawn — the window of the site's hero (`www/src/components/home/Stage.astro`):
 * its sidebar, its bar, and five moments on the demo shop — a question built without SQL, the
 * SQL editor, the AI assistant, the dashboard, the forecast. `view` picks the moment; CSS does
 * the rest. Drawn at 1080 × 600 and scaled to the width it is given.
 */
export const STAGE_VIEWS = ['builder', 'sql', 'assistant', 'dashboard', 'forecast'] as const
export type StageView = (typeof STAGE_VIEWS)[number]

const W = 1080
const HEIGHT = 600

const ICON = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  sql: 'm8 9-3 3 3 3M16 9l3 3-3 3M13.5 6l-3 12',
  sources: 'M4 5.5c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  structure: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 10h18M9 10v10',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  admin: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1',
  api: 'M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 7h7',
  lock: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM10 12h5v4h-5zM11 12v-1.2a1.5 1.5 0 0 1 3 0V12',
  headset: 'M4 15v-3a8 8 0 0 1 16 0v3M4.5 14h1A1.5 1.5 0 0 1 7 15.5v3A1.5 1.5 0 0 1 5.5 20h-1A1.5 1.5 0 0 1 3 18.5v-3A1.5 1.5 0 0 1 4.5 14zM18.5 14h1a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5z',
  bag: 'M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8zM9 8V6a3 3 0 0 1 6 0v2',
  check: 'M20 6 9 17l-5-5',
  chevron: 'm6 9 6 6 6-6',
  updown: 'm7 15 5 5 5-5M7 9l5-5 5 5',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5',
  panel: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
  filter: 'M4 6h16M7 12h10M10 18h4',
  share: 'M18 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM18 16a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  db: 'M5 6c0-1.4 3.1-2.5 7-2.5s7 1.1 7 2.5-3.1 2.5-7 2.5S5 7.4 5 6M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6',
  send: 'M12 19V5M5 12l7-7 7 7',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  bars: 'M5 20V10M12 20V4M19 20v-7',
  table: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM3 10h18M3 15h18M10 4v16',
  waves: 'M2 12c2.5-4 5-4 7.5 0s5 4 7.5 0 3.5-2.5 5-2',
} as const

function Icon({ name, size = 15, width = 1.9 }: { name: keyof typeof ICON; size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON[name]} />
    </svg>
  )
}

/** Two years of monthly revenue (from January 2025), and six months forecast. */
const N = 24
const H = 6
const truth = (i: number) => 420 + 26 * i + 120 * Math.sin((2 * Math.PI * (i - 4)) / 12)
const noise = (i: number) => (((i * 37) % 11) - 5) * 9
const MEASURED = Array.from({ length: N }, (_, i) => truth(i) + noise(i))
const AHEAD = Array.from({ length: H }, (_, k) => truth(N + k))
const spread = (k: number) => 30 + 22 * Math.sqrt(k + 1)
function curve(w: number, h: number, count: number, lo: number, hi: number) {
  const x = (i: number) => 8 + (i / (count - 1)) * (w - 16)
  const y = (v: number) => h - 6 - ((v - lo) / (hi - lo)) * (h - 16)
  const path = (pts: [number, number][]) => pts.map(([i, v], j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return { x, y, path }
}
const DASH = curve(520, 170, 12, 600, 1250)
const DASH_LINE = DASH.path(MEASURED.slice(N - 12).map((v, i) => [i, v]))
const DASH_AREA = `${DASH_LINE} L${DASH.x(11).toFixed(1)} 170 L${DASH.x(0).toFixed(1)} 170 Z`
const FC = curve(600, 300, N + H, 250, 1350)
const PAST = FC.path(MEASURED.map((v, i) => [i, v]))
const PAST_AREA = `${PAST} L${FC.x(N - 1).toFixed(1)} 300 L${FC.x(0).toFixed(1)} 300 Z`
const LAST = MEASURED[N - 1] as number
const NEXT = FC.path([[N - 1, LAST], ...AHEAD.map((v, k) => [N + k, v] as [number, number])])
const BAND = `${FC.path([[N - 1, LAST], ...AHEAD.map((v, k) => [N + k, v + spread(k)] as [number, number])])} ${AHEAD.map((v, k) => [N + k, v - spread(k)] as const)
  .reverse()
  .map(([i, v]) => `L${FC.x(i).toFixed(1)} ${FC.y(v).toFixed(1)}`)
  .join(' ')} L${FC.x(N - 1).toFixed(1)} ${FC.y(LAST).toFixed(1)} Z`
const TIP = 2
const ZONE = { x: FC.x(N - 0.5), w: FC.x(N + H - 1) - FC.x(N - 0.5) + 8 }
const WEEKLY = [60, 64, 58, 66, 63, 70, 67, 72, 69, 74, 71, 52]
const SPARK = WEEKLY.map((v, i) => `${i ? 'L' : 'M'}${(i / (WEEKLY.length - 1)) * 96 + 2} ${32 - ((v - 48) / 28) * 28}`).join(' ')

const CHANNELS = [612_400, 438_150, 231_900]
const CHANNEL_COLORS = ['#2da31e', '#14b8a6', '#a3d93a']
const BASKETS = [82.1, 87.4, 76.8]
const REGIONS: [string, number, number, number][] = [
  ['Île-de-France', 92.4, 1284, 4.5],
  ['Auvergne-Rhône-Alpes', 88.1, 702, 4.6],
  ['Occitanie', 86.7, 498, 4.4],
  ['Bretagne', 91.2, 421, 4.7],
  ['Nouvelle-Aquitaine', 84.9, 402, 4.5],
  ['Hauts-de-France', 83.5, 377, 4.3],
]

/** The SQL, coloured as the editor colours it. */
const SQL: ReactNode[] = [
  <Fragment key="l1">
    <span className="k">select</span> c.region,
  </Fragment>,
  <Fragment key="l2">
    {'       '}
    <span className="f">avg</span>(o.montant_total) <span className="k">as</span> panier_moyen,
  </Fragment>,
  <Fragment key="l3">
    {'       '}
    <span className="f">count</span>(t.ticket_id){'   '}
    <span className="k">as</span> tickets,
  </Fragment>,
  <Fragment key="l4">
    {'       '}
    <span className="f">avg</span>(t.satisfaction){'  '}
    <span className="k">as</span> satisfaction
  </Fragment>,
  <Fragment key="l5">
    {'  '}
    <span className="k">from</span> <span className="i">boutique</span>.public.commandes o
  </Fragment>,
  <Fragment key="l6">
    {'  '}
    <span className="k">join</span> <span className="i">boutique</span>.public.clients c <span className="k">on</span> c.id = o.client_id
  </Fragment>,
  <Fragment key="l7">
    {'  '}
    <span className="k">left join</span> <span className="i">support</span>.support.tickets t <span className="k">on</span> t.client_id = c.id
  </Fragment>,
  <Fragment key="l8">
    {' '}
    <span className="k">group by</span> c.region <span className="k">order by</span> tickets <span className="k">desc</span>
  </Fragment>,
]

export function LoginStage({ view, className }: { view: StageView; className?: string }) {
  const frame = useRef<HTMLDivElement>(null)
  // Scaled to the width it is given, as the site's window.
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const fit = () => {
      const k = Math.min(1, el.clientWidth / W)
      el.style.setProperty('--k', String(k))
      el.style.height = `${HEIGHT * k}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const lang = intlLocale()
  const money = (n: number, compact = false) =>
    new Intl.NumberFormat(lang, {
      style: 'currency',
      currency: 'EUR',
      ...(compact ? { notation: 'compact', maximumFractionDigits: n >= 1e6 ? 2 : 0 } : { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
    }).format(n)
  const number = (n: number, digits = 0) => new Intl.NumberFormat(lang, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n)
  const month = (i: number, style: 'short' | 'long' = 'short') => new Intl.DateTimeFormat(lang, { month: style, year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2025, i, 1)))

  const channelNames = ['Web', 'Mobile', 'Marketplace']
  const top = Math.max(...CHANNELS)
  const tipX = FC.x(N + TIP)
  const tipY = FC.y(AHEAD[TIP] as number)
  const at = { left: `${((tipX / 600) * 100).toFixed(2)}%`, top: `${((tipY / 322) * 100).toFixed(2)}%` }
  const crumbs: Record<StageView, string[]> = {
    builder: [$t('Questions'), $t('Chiffre d’affaires par canal')],
    sql: [$t('Éditeur SQL')],
    assistant: [$t('Assistant IA')],
    dashboard: [$t('Tableaux de bord'), $t('Ventes de la boutique')],
    forecast: [$t('Questions'), $t('Chiffre d’affaires par mois')],
  }

  return (
    <div ref={frame} className={cn(styles.root, className)} aria-hidden="true">
      <div className="stage" data-view={view}>
        <div className="chrome">
          <div className="dots">
            <i />
            <i />
            <i />
          </div>
          <span className="url">insights.exemple.fr</span>
        </div>

        <aside className="side">
          <div className="ws">
            <svg className="mark" width="30" height="30" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <rect width="64" height="64" rx="16" fill="#104832" />
              <path d="M32 15a17 17 0 1 0 17 17" stroke="#dcf3bd" strokeWidth="9" strokeLinecap="round" />
              <rect x="27" y="27" width="10" height="10" rx="3" fill="#dcf3bd" />
              <circle cx="46" cy="18" r="5" fill="#76cf98" />
            </svg>
            <span className="who">
              <b>eodia insights</b>
              <small>{$t('Toutes les sources')}</small>
            </span>
            <span className="ud">
              <Icon name="updown" size={13} />
            </span>
          </div>
          <ul className="nav">
            <li>
              <Icon name="home" />
              <span className="grow">{$t('Accueil')}</span>
            </li>
            <li data-on="assistant">
              <span className="orb-i" />
              <span className="grow">{$t('Assistant IA')}</span>
              <em className="badge">{$t('Nouveau')}</em>
            </li>
            <li>
              <Icon name="folder" />
              <span className="grow">{$t('Dossiers')}</span>
            </li>
            {(
              [
                [$t('Mon dossier'), 'lock', '#71717a', ''],
                [$t('Service client'), 'headset', '#8b5cf6', ''],
                [$t('Ventes'), 'bag', '#16a34a', 'builder dashboard forecast'],
              ] as const
            ).map(([name, icon, color, views]) => (
              <li key={name} className="sub" data-on={views || undefined} style={{ ['--c' as string]: color }}>
                <Icon name={icon} size={14} />
                <span className="grow">{name}</span>
              </li>
            ))}
            {(
              [
                ['sql', $t('Éditeur SQL'), 'sql'],
                ['sources', $t('Sources de données'), ''],
                ['structure', $t('Structure'), ''],
                ['history', $t('Historique'), ''],
              ] as const
            ).map(([icon, label, views]) => (
              <li key={icon} data-on={views || undefined}>
                <Icon name={icon} />
                <span className="grow">{label}</span>
              </li>
            ))}
          </ul>
          <ul className="nav foot">
            <li>
              <Icon name="admin" />
              <span className="grow">{$t('Administration')}</span>
              <Icon name="chevron" size={12} />
            </li>
            <li>
              <Icon name="api" />
              <span className="grow">{$t('API et MCP')}</span>
            </li>
          </ul>
          <div className="me">
            <span className="avatar">
              AM
              <i />
            </span>
            <span className="who">
              <b>Alice Martin</b>
              <small>{$t('Administratrice')}</small>
            </span>
            <span className="ud">
              <Icon name="updown" size={13} />
            </span>
          </div>
        </aside>

        <header className="top">
          <span className="tb-icon">
            <Icon name="panel" size={16} />
          </span>
          <span className="crumbs">
            {STAGE_VIEWS.map((v) => (
              <span key={v} data-show={v}>
                {crumbs[v].map((c, i, all) => (
                  <span key={c} className="crumb">
                    {i > 0 ? <i>/</i> : null}
                    <b className={i === all.length - 1 && all.length > 1 ? 'last' : undefined}>{c}</b>
                  </span>
                ))}
              </span>
            ))}
          </span>
          <span className="new">
            <Icon name="plus" size={13} width={2.4} />
            {$t('Nouveau')}
          </span>
          <span className="search">
            <Icon name="search" size={13} />
            {$t('Rechercher…')}
            <kbd>Ctrl</kbd>
            <kbd>K</kbd>
          </span>
          <span className="spark">
            <Icon name="sparkle" size={16} />
          </span>
        </header>

        {/* 1. The question, without SQL */}
        <section className="pane builder" data-show="builder">
          <div className="pane-head">
            <b>{$t('Chiffre d’affaires par canal')}</b>
            <span className="btn green">{$t('Enregistrer')}</span>
          </div>
          <div className="builder-body">
            <div className="notebook">
              <div className="step">
                <p>{$t('Données')}</p>
                <span className="pill blue">
                  <Icon name="table" size={13} width={2} />
                  {$t('Commandes')}
                </span>
              </div>
              <div className="step">
                <p>{$t('Filtrer')}</p>
                <span className="pill violet">{$t('Statut est livrée')}</span>
              </div>
              <div className="step">
                <p>{$t('Résumer')}</p>
                <div className="row">
                  <span className="pill green">{$t('Somme de Montant total')}</span>
                  <span className="by">{$t('par')}</span>
                  <span className="pill green">{$t('Canal')}</span>
                </div>
              </div>
              <span className="visualize">{$t('Visualiser')}</span>
            </div>
            <div className="card chart">
              <p className="card-title">{$t('Chiffre d’affaires par canal')}</p>
              <div className="bars">
                {CHANNELS.map((v, i) => (
                  <div key={channelNames[i]} className="bar" style={{ ['--h' as string]: `${Math.round((v / top) * 100)}%`, ['--i' as string]: i, ['--c' as string]: CHANNEL_COLORS[i] }}>
                    <span className="val">{money(v, true)}</span>
                    <i />
                    <span className="lab">{channelNames[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2. The SQL editor */}
        <section className="pane sql" data-show="sql">
          <div className="pane-head">
            <b>{$t('Paniers et tickets')}</b>
            <span className="btn green">{$t('Exécuter')}</span>
          </div>
          <div className="editor">
            <ol>
              {SQL.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed lines
                <li key={i}>{l}</li>
              ))}
            </ol>
            <span className="caret" />
          </div>
          <div className="card result">
            <div className="result-head">
              {[$t('Région'), $t('Panier moyen'), $t('Tickets'), $t('Satisfaction')].map((c, i) => (
                <span key={c} className={i > 0 ? 'num' : undefined}>
                  {c}
                </span>
              ))}
            </div>
            {REGIONS.map(([name, basket, tickets, score], i) => (
              <div key={name} className="result-row" style={{ ['--i' as string]: i }}>
                <span>{name}</span>
                <span className="num">{money(basket)}</span>
                <span className="num tick">
                  <i style={{ ['--w' as string]: `${Math.round((tickets / 1284) * 100)}%` }} />
                  {number(tickets)}
                </span>
                <span className="num">{number(score, 1)}</span>
              </div>
            ))}
            <p className="foot">{$t('6 lignes · 412 ms')}</p>
          </div>
        </section>

        {/* 3. The AI assistant */}
        <section className="pane assistant" data-show="assistant">
          <div className="threads">
            <span className="btn green wide">
              <Icon name="plus" size={13} width={2.4} />
              {$t('Nouvelle conversation')}
            </span>
            <span className="find">
              <Icon name="search" size={12} />
              {$t('Rechercher une conversation')}
            </span>
            <small>{$t('Aujourd’hui')}</small>
            {[$t('Panier moyen par canal'), $t('Clients fidèles en 2026'), $t('Retours par région'), $t('Tickets ouverts cette semaine')].map((h, i) => (
              <span key={h} className={cn('thread', i === 0 && 'on')}>
                {h}
              </span>
            ))}
          </div>
          <div className="talk">
            <div className="glow-a" />
            <p className="ask">{$t('Quel canal a le meilleur panier moyen ce trimestre ?')}</p>
            <div className="answer">
              <span className="orb" />
              <div className="answer-body">
                <ul className="chips">
                  {[$t('Recherche dans le schéma'), $t('Lecture de la table'), $t('Exécution de la requête'), $t('Préparation du graphique')].map((step, i) => (
                    <li key={step} style={{ ['--i' as string]: i }}>
                      <Icon name="check" size={11} width={3} />
                      {step}
                    </li>
                  ))}
                </ul>
                <p className="said">
                  {$t('Le canal Mobile a le panier moyen le plus élevé ce trimestre : {mobile}, devant le Web ({web}) et la Marketplace ({market}).', {
                    mobile: money(BASKETS[1] as number),
                    web: money(BASKETS[0] as number),
                    market: money(BASKETS[2] as number),
                  })}
                </p>
                <div className="card mini">
                  <div className="mini-head">
                    <span>
                      <b>{$t('Panier moyen par canal')}</b>
                      <small>{$t('Ce trimestre · commandes livrées')}</small>
                    </span>
                    <span className="kinds">
                      <i className="on">
                        <Icon name="bars" size={12} />
                      </i>
                      <i>
                        <Icon name="trend" size={12} />
                      </i>
                      <i>
                        <Icon name="table" size={12} />
                      </i>
                    </span>
                  </div>
                  <div className="mini-bars">
                    {BASKETS.map((b, i) => (
                      <div key={channelNames[i]} className="mbar" style={{ ['--h' as string]: `${Math.round(((b - 60) / 30) * 100)}%`, ['--i' as string]: i }} data-hot={i === 1 ? '' : undefined}>
                        <span className="val">{money(b)}</span>
                        <i />
                        <span className="lab">{channelNames[i]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mini-foot">
                    <span>
                      <Icon name="db" size={11} />
                      {$t('3 lignes')}
                    </span>
                    <span className="save">{$t('Enregistrer comme question')} ›</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="composer">
              <span className="ph">{$t('Demandez n’importe quoi sur vos données…')}</span>
              <span className="row">
                <span className="src">
                  <Icon name="db" size={11} />
                  {$t('Toutes les sources')}
                </span>
                <span className="hint">{$t('Entrée pour envoyer')}</span>
                <span className="go">
                  <Icon name="send" size={13} width={2.2} />
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* 4. The dashboard */}
        <section className="pane dash" data-show="dashboard">
          <div className="dash-head">
            <span>
              <b>{$t('Ventes de la boutique')}</b>
              <small>{$t('Chiffre d’affaires, commandes et clients — filtrable par période et canal.')}</small>
            </span>
            <span className="btn ghost">
              <Icon name="share" size={12} />
              {$t('Partager')}
            </span>
            <span className="btn ghost">{$t('Modifier')}</span>
          </div>
          <div className="filters">
            {[
              [$t('Période'), $t('12 derniers mois')],
              [$t('Canal'), ''],
              [$t('Région'), ''],
            ].map(([label, value], i) => (
              <span key={label} className={cn('filter', value && 'set')}>
                <Icon name={i === 0 ? 'calendar' : 'filter'} size={12} />
                <span className="fl">{label}</span>
                {value ? <b>{value}</b> : null}
                <Icon name="chevron" size={11} width={2.4} />
              </span>
            ))}
          </div>
          <div className="tabs">
            {[$t('Ventes'), $t('Service client'), $t('Commandes')].map((tab, i) => (
              <span key={tab} className={i === 0 ? 'on' : undefined}>
                {tab}
              </span>
            ))}
          </div>
          <div className="kpis">
            {[
              [$t('Chiffre d’affaires'), money(7_290_000, true)],
              [$t('Commandes'), number(12_944)],
              [$t('Panier moyen'), money(704.5)],
              [$t('Commandes par semaine'), number(150)],
            ].map(([label, value], i) => (
              <div key={label} className="card kpi" style={{ ['--i' as string]: i }}>
                <small>{label}</small>
                <span className="kv">
                  <b>{value}</b>
                  {i === 3 ? (
                    <svg className="sparkline" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
                      <path d={SPARK} />
                    </svg>
                  ) : null}
                </span>
                {i === 3 ? <em>{new Intl.NumberFormat(lang, { style: 'percent', signDisplay: 'always', minimumFractionDigits: 1 }).format(-0.186)}</em> : null}
              </div>
            ))}
          </div>
          <div className="card trend" style={{ ['--i' as string]: 4 }}>
            <p className="card-title">{$t('Chiffre d’affaires par mois')}</p>
            <svg viewBox="0 0 520 172" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="ls-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#2563eb" stopOpacity="0.22" />
                  <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[40, 85, 130].map((y) => (
                <line key={y} x1="8" x2="512" y1={y} y2={y} className="grid" />
              ))}
              <path d={DASH_AREA} className="area" fill="url(#ls-area)" />
              <path d={DASH_LINE} className="line" pathLength={1} />
            </svg>
          </div>
          <div className="card chan" style={{ ['--i' as string]: 5 }}>
            <p className="card-title">{$t('Commandes par canal')}</p>
            <div className="cbars">
              {CHANNELS.map((v, i) => (
                <i key={channelNames[i]} style={{ ['--h' as string]: `${Math.round((v / top) * 100)}%`, ['--i' as string]: i }} />
              ))}
            </div>
          </div>
        </section>

        {/* 5. The forecast */}
        <section className="pane forecast" data-show="forecast">
          <div className="card fchart">
            <div className="fhead">
              <b>{$t('Chiffre d’affaires par mois')}</b>
              <span className="legend">
                <i className="m" />
                {$t('Chiffre d’affaires')}
                <i className="p" />
                {$t('Prévision')}
              </span>
            </div>
            <div className="fplot">
              <svg viewBox="0 0 600 322" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="ls-past" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2563eb" stopOpacity="0.2" />
                    <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <rect x={ZONE.x} y="4" width={ZONE.w} height="296" className="zone" rx="4" />
                <text x={ZONE.x + ZONE.w / 2} y="18" className="zone-label" textAnchor="middle">
                  {$t('Prévision')}
                </text>
                {[80, 150, 220].map((y) => (
                  <line key={y} x1="8" x2="592" y1={y} y2={y} className="grid" />
                ))}
                <path d={PAST_AREA} className="area" fill="url(#ls-past)" />
                <path d={PAST} className="past" pathLength={1} />
                <path d={BAND} className="band" />
                <path d={NEXT} className="next" pathLength={1} />
                {[0, 6, 12, 18, 24].map((i) => (
                  <text key={i} x={FC.x(i)} y="318" className="axis" textAnchor="middle">
                    {month(i)}
                  </text>
                ))}
              </svg>
              <span className="tip-dot" style={at} />
              <div className="tooltip" style={at}>
                <b>{month(N + TIP, 'long')}</b>
                <span>
                  <i />
                  {$t('Prévision')} · {money((AHEAD[TIP] as number) * 1000, true)}
                </span>
                <small>
                  {$t('entre {low} et {high}', {
                    low: money(((AHEAD[TIP] as number) - spread(TIP)) * 1000, true),
                    high: money(((AHEAD[TIP] as number) + spread(TIP)) * 1000, true),
                  })}
                </small>
              </div>
            </div>
          </div>
          <aside className="card fpanel">
            <p className="fp-title">{$t('Prévision')}</p>
            <span className="label">{$t('Prolonger la tendance de')}</span>
            <div className="fp-row">
              <span className="num-in">6</span>
              <small>{$t('périodes')}</small>
              <span className="grow" />
              {['+3', '+6', '+12'].map((n) => (
                <span key={n} className={cn('qk', n === '+6' && 'on')}>
                  {n}
                </span>
              ))}
            </div>
            <span className="label">{$t('Méthode')}</span>
            <div className="seg">
              {(
                [
                  [$t('Auto'), 'sparkle'],
                  [$t('Droite'), 'trend'],
                  [$t('Lissée'), 'trend'],
                  [$t('Saison'), 'waves'],
                ] as const
              ).map(([m, icon], i) => (
                <span key={m} className={i === 3 ? 'on' : undefined}>
                  <Icon name={icon} size={13} />
                  <em>{m}</em>
                </span>
              ))}
            </div>
            <div className="toggle">
              <span className="sw">
                <i />
              </span>
              {$t('Intervalle de confiance (80 %)')}
            </div>
            <p className="fp-note">{$t('La partie prévue est dessinée en pointillés verts : tendance et saison, prolongées par Holt-Winters.')}</p>
          </aside>
        </section>
      </div>
    </div>
  )
}
