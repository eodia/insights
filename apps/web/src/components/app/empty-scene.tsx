'use client'

import { cn } from '@/lib/utils'
import { useId } from 'react'
import styles from './empty-scene.module.css'

type Tone = 'question' | 'dashboard' | 'model' | 'folder' | 'filter'

/** A small item tile, as the application shows them: a tinted square and its glyph. */
function Tile({ x, y, size = 12, tone }: { x: number; y: number; size?: number; tone: Tone }) {
  const c = x + size / 2
  const m = y + size / 2
  return (
    <g className={styles[tone]}>
      <rect x={x} y={y} width={size} height={size} rx={size * 0.3} className={styles.tileBack} />
      {tone === 'question' ? (
        <path d={`M${c - 2.5} ${m + 2.5}v-2M${c} ${m + 2.5}v-5M${c + 2.5} ${m + 2.5}v-3.5`} className={styles.tileGlyph} />
      ) : tone === 'dashboard' ? (
        <path d={`M${c - 2.75} ${m - 2.75}h2.25v2.25h-2.25ZM${c + 0.5} ${m - 2.75}h2.25v2.25h-2.25ZM${c - 2.75} ${m + 0.5}h2.25v2.25h-2.25ZM${c + 0.5} ${m + 0.5}h2.25v2.25h-2.25Z`} className={styles.tileGlyph} />
      ) : tone === 'model' ? (
        <path d={`M${c - 3} ${m - 2}h6M${c - 3} ${m}h6M${c - 3} ${m + 2}h6`} className={styles.tileGlyph} />
      ) : tone === 'filter' ? (
        <path d={`M${c - 3.2} ${m - 2.6}h6.4l-2.4 2.9v2.7l-1.6.9v-3.6Z`} className={styles.tileGlyph} />
      ) : (
        <path d={`M${c - 3.5} ${m - 2}a.8.8 0 0 1 .8-.8h2l1 1h3.4a.8.8 0 0 1 .8.8v3.6a.8.8 0 0 1-.8.8h-6.4a.8.8 0 0 1-.8-.8Z`} className={styles.tileGlyph} />
      )}
    </g>
  )
}

/** The window every scene is drawn in, as on the sign-in page: three dots and a bar. */
function Window({ x, y, w, h, shadow }: { x: number; y: number; w: number; h: number; shadow: string }) {
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx="11" className={styles.window} filter={`url(#${shadow})`} />
      <circle cx={x + 10} cy={y + 9} r="2" className={styles.dotRed} />
      <circle cx={x + 17} cy={y + 9} r="2" className={styles.dotYellow} />
      <circle cx={x + 24} cy={y + 9} r="2" className={styles.dotGreen} />
      <path d={`M${x} ${y + 18.5}h${w}`} className={styles.divider} />
    </>
  )
}

function Cursor({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y}v15.5l4.2-3.9 3 6.6 2.8-1.2-3-6.5h5.8Z`} className={styles.cursorShape} />
}

/** A dashed way from one place to another, and its arrowhead. */
function Path({ d, head }: { d: string; head: string }) {
  return (
    <>
      <path d={d} className={styles.path} />
      <path d={head} className={styles.pathHead} />
    </>
  )
}

export type EmptySceneVariant = 'folder' | 'preview' | 'dashboard' | 'no-rows' | 'no-tables' | 'not-found' | 'error'

/**
 * The empty states and the error pages, in the look of the sign-in page — a small window of
 * the application, its tinted tiles and the bars of its charts: a folder waiting for its first
 * item, a preview waiting for a choice, a dashboard for its first card, a query that found no
 * row, a home page without a table to explore, an address that leads nowhere, a screen that
 * broke.
 */
export function EmptyScene({ variant, className }: { variant: EmptySceneVariant; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const shadow = `${id}-shadow`
  const bar = (n: 1 | 2 | 3) => `url(#${id}-bar${n})`

  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 240 180" width="240" height="180" fill="none" className={cn(styles.scene, className)}>
      <defs>
        <radialGradient id={`${id}-glow`}>
          <stop className={variant === 'error' ? styles.glowWarm : styles.glowCenter} />
          <stop offset="1" className={styles.glowEdge} />
        </radialGradient>
        <radialGradient id={`${id}-fade`}>
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${id}-grid-mask`}>
          <ellipse cx="120" cy="92" rx="118" ry="86" fill={`url(#${id}-fade)`} />
        </mask>
        <pattern id={`${id}-grid`} width="12" height="12" patternUnits="userSpaceOnUse">
          <circle cx="6" cy="6" r="0.75" className={styles.gridDot} />
        </pattern>
        {([1, 2, 3] as const).map((n) => (
          <linearGradient key={n} id={`${id}-bar${n}`} x1="0" y1="0" x2="0" y2="1">
            <stop className={styles[`bar${n}Top`]} />
            <stop offset="1" className={styles[`bar${n}`]} />
          </linearGradient>
        ))}
        <linearGradient id={`${id}-ink`} x1="0" y1="0" x2="1" y2="0">
          <stop className={styles.bar1} />
          <stop offset="0.55" className={styles.bar2} />
          <stop offset="1" className={styles.bar3} />
        </linearGradient>
        <filter id={shadow} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" className={styles.shadowColor} />
        </filter>
      </defs>

      <ellipse cx="120" cy="96" rx="112" ry="80" fill={`url(#${id}-glow)`} />
      <rect width="240" height="180" fill={`url(#${id}-grid)`} mask={`url(#${id}-grid-mask)`} />

      {variant === 'folder' ? (
        <>
          <Window x={44} y={42} w={152} h={114} shadow={shadow} />
          <Tile x={56} y={70} size={18} tone="folder" />
          <rect x="81" y="72.5" width="36" height="5" rx="2.5" className={styles.ink} />
          <rect x="81" y="81.5" width="22" height="3.5" rx="1.75" className={styles.soft} />

          {/* Four places to fill: the first one takes the item on its way. */}
          <rect x="56" y="98" width="60" height="22" rx="7" className={styles.slotTarget} />
          <circle cx="86" cy="109" r="6.5" className={styles.plusBack} />
          <path d="M86 106v6m-3-3h6" className={styles.plus} />
          <rect x="124" y="98" width="60" height="22" rx="7" className={styles.slot} />
          <rect x="56" y="126" width="60" height="22" rx="7" className={styles.slot} />
          <rect x="124" y="126" width="60" height="22" rx="7" className={styles.slot} />

          <Path d="M136 52c-10 6-18 22-20 38" head="m112.5 86.5 3.5 5.5 4-5" />

          <g className={styles.float}>
            <g transform="rotate(-6 172 46)">
              <rect x="134" y="18" width="78" height="58" rx="9" className={styles.window} filter={`url(#${shadow})`} />
              <Tile x={141} y={25} tone="question" />
              <rect x="157" y="28.5" width="34" height="4" rx="2" className={styles.ink} />
              <path d="M141 67.5h64" className={styles.divider} />
              <g className={styles.bars}>
                <rect x="145" y="51" width="12" height="16" rx="3" fill={bar(1)} />
                <rect x="162" y="44" width="12" height="23" rx="3" fill={bar(2)} />
                <rect x="179" y="55" width="12" height="12" rx="3" fill={bar(3)} />
              </g>
            </g>
            <Cursor x={198} y={60} />
          </g>

          <path d="M30 62v7m-3.5-3.5h7" className={styles.spark} />
          <circle cx="214" cy="128" r="2.2" className={styles.sparkDot} />
          <circle cx="32" cy="138" r="1.6" className={styles.soft} />
        </>
      ) : variant === 'preview' ? (
        <>
          {/* The list, its second item chosen… */}
          <rect x="18" y="52" width="80" height="96" rx="10" className={styles.window} filter={`url(#${shadow})`} />
          <rect x="22" y="77" width="72" height="20" rx="6" className={styles.selected} />
          {(
            [
              [60, 'question', 40],
              [81, 'dashboard', 34],
              [102, 'model', 44],
              [123, 'question', 28],
            ] as const
          ).map(([y, tone, w]) => (
            <g key={y}>
              <Tile x={28} y={y} size={11} tone={tone} />
              <rect x="44" y={y + 3.5} width={w} height="4" rx="2" className={y === 81 ? styles.inkStrong : styles.ink} />
            </g>
          ))}
          <g className={styles.click}>
            <circle cx="80" cy="88" r="7" className={styles.ripple} />
          </g>
          <Cursor x={79} y={87} />

          {/* …and what it shows. */}
          <g className={styles.float}>
            <Window x={106} y={30} w={118} h={122} shadow={shadow} />
            <rect x="116" y="57" width="48" height="5" rx="2.5" className={styles.inkStrong} />
            <rect x="188" y="54.5" width="26" height="10" rx="5" className={styles.button} />
            <rect x="116" y="71" width="46" height="26" rx="6" className={styles.tileCard} />
            <rect x="121" y="76" width="20" height="3" rx="1.5" className={styles.soft} />
            <rect x="121" y="84" width="30" height="7" rx="2" className={styles.inkStrong} />
            <rect x="168" y="71" width="46" height="26" rx="6" className={styles.tileCard} />
            <rect x="173" y="76" width="18" height="3" rx="1.5" className={styles.soft} />
            <path d="M173 91l6-3 5 1.5 6-5 5 2 6-4 5-2" className={styles.line} />
            <path d="M116 112.5h98M116 124.5h98" className={styles.gridLine} />
            <path d="M116 140.5h98" className={styles.divider} />
            <g className={styles.bars}>
              <rect x="121" y="110" width="15" height="30" rx="3" fill={bar(1)} />
              <rect x="143" y="118" width="15" height="22" rx="3" fill={bar(2)} />
              <rect x="165" y="104" width="15" height="36" rx="3" fill={bar(1)} />
              <rect x="187" y="124" width="15" height="16" rx="3" fill={bar(3)} />
            </g>
          </g>

          <path d="M214 20v7m-3.5-3.5h7" className={styles.spark} />
          <circle cx="26" cy="40" r="2.2" className={styles.sparkDot} />
          <circle cx="231" cy="96" r="1.6" className={styles.soft} />
        </>
      ) : variant === 'dashboard' ? (
        <>
          {/* A dashboard, its filter set, its grid waiting for cards… */}
          <Window x={28} y={42} w={170} h={116} shadow={shadow} />
          <rect x="40" y="69" width="34" height="5" rx="2.5" className={styles.inkStrong} />
          <g className={styles.filter}>
            <rect x="81" y="65.5" width="36" height="12" rx="6" className={styles.tileBack} />
            <path d="M86.5 68.8h6l-2.3 2.7v2.5l-1.4.8v-3.3Z" className={styles.tileGlyph} />
            <rect x="96" y="70" width="15" height="3" rx="1.5" className={styles.toneFill} />
          </g>
          <rect x="40" y="86" width="88" height="62" rx="8" className={styles.slotTarget} />
          <circle cx="84" cy="117" r="7.5" className={styles.plusBack} />
          <path d="M84 113.5v7m-3.5-3.5h7" className={styles.plus} />
          <rect x="136" y="86" width="50" height="28" rx="7" className={styles.slot} />
          <rect x="136" y="120" width="50" height="28" rx="7" className={styles.slot} />

          <Path d="M152 46c-14 8-26 20-31 35" head="m117.5 77.5 3.5 4.5 3.5-5" />

          {/* …and the first one, on its way. */}
          <g className={styles.float}>
            <g transform="rotate(5 186 40)">
              <rect x="148" y="12" width="80" height="56" rx="9" className={styles.window} filter={`url(#${shadow})`} />
              <Tile x={155} y={19} tone="question" />
              <rect x="171" y="22.5" width="32" height="4" rx="2" className={styles.ink} />
              <path d="M155 56l10-6 9 3 10-10 9 4 10-9 10 2V60H155Z" className={styles.area} />
              <path d="M155 56l10-6 9 3 10-10 9 4 10-9 10 2" className={styles.line} />
              <path d="M155 60.5h66" className={styles.divider} />
            </g>
            <Cursor x={212} y={54} />
          </g>

          <path d="M24 70v7m-3.5-3.5h7" className={styles.spark} />
          <circle cx="214" cy="140" r="2.2" className={styles.sparkDot} />
          <circle cx="20" cy="136" r="1.6" className={styles.soft} />
        </>
      ) : variant === 'no-rows' ? (
        <>
          {/* A table with its columns and no row… */}
          <Window x={30} y={40} w={156} h={112} shadow={shadow} />
          <rect x="30.5" y="59" width="155" height="14" className={styles.tileCard} />
          <rect x="40" y="64" width="26" height="4" rx="2" className={styles.inkStrong} />
          <rect x="84" y="64" width="34" height="4" rx="2" className={styles.inkStrong} />
          <rect x="136" y="64" width="24" height="4" rx="2" className={styles.inkStrong} />
          <path d="M30 73.5h156" className={styles.divider} />
          <rect x="40" y="82" width="136" height="13" rx="4.5" className={styles.slot} />
          <rect x="40" y="102" width="136" height="13" rx="4.5" className={styles.slot} />
          <rect x="40" y="122" width="136" height="13" rx="4.5" className={styles.slot} />

          {/* …searched through: nothing under the lens. */}
          <g className={styles.float}>
            <path d="m175 133 13 13" className={styles.lensHandle} />
            <circle cx="162" cy="120" r="18" className={styles.lens} filter={`url(#${shadow})`} />
            <circle cx="162" cy="120" r="7" className={styles.nothing} />
            <path d="m157 125 10-10" className={styles.nothing} />
          </g>

          {/* The filter that may be too narrow. */}
          <g className={styles.floatSlow}>
            <g transform="rotate(6 186 30)">
              <rect x="154" y="18" width="66" height="24" rx="8" className={styles.window} filter={`url(#${shadow})`} />
              <Tile x={160} y={24} tone="filter" />
              <g className={styles.filter}>
                <rect x="177" y="28" width="35" height="4" rx="2" className={styles.toneFill} />
              </g>
            </g>
          </g>

          <path d="M22 66v7m-3.5-3.5h7" className={styles.spark} />
          <circle cx="210" cy="78" r="2.2" className={styles.sparkDot} />
          <circle cx="24" cy="140" r="1.6" className={styles.soft} />
        </>
      ) : variant === 'no-tables' ? (
        <>
          {/* A base… */}
          <g filter={`url(#${shadow})`} className={styles.base}>
            <path d="M42 62v54c0 4.7 13.4 8.5 30 8.5s30-3.8 30-8.5V62" className={styles.baseBody} />
            <ellipse cx="72" cy="62" rx="30" ry="8.5" className={styles.baseTop} />
          </g>
          <path d="M42 80c0 4.7 13.4 8.5 30 8.5s30-3.8 30-8.5M42 98c0 4.7 13.4 8.5 30 8.5s30-3.8 30-8.5" className={styles.baseRing} />
          <circle cx="56" cy="91" r="1.6" className={styles.baseLight} />
          <circle cx="56" cy="109" r="1.6" className={styles.baseLight} />

          {/* …whose tables are not open to you yet. */}
          <Path d="M106 92h26" head="m128.5 88 4 4-4 4" />
          <g className={styles.float}>
            <circle cx="119" cy="92" r="10" className={styles.window} filter={`url(#${shadow})`} />
            <g className={styles.filter}>
              <path d="M115.5 91v-2.5a3.5 3.5 0 0 1 7 0V91" className={styles.tileGlyph} />
              <rect x="114" y="90.5" width="10" height="7.5" rx="2" className={styles.toneSolid} />
            </g>
          </g>

          <rect x="138" y="46" width="86" height="92" rx="11" className={styles.window} filter={`url(#${shadow})`} />
          <Tile x={147} y={55} tone="model" />
          <rect x="163" y="58.5" width="40" height="4" rx="2" className={styles.ink} />
          <path d="M138 75.5h86" className={styles.divider} />
          <rect x="147" y="84" width="68" height="10" rx="3.5" className={styles.slot} />
          <rect x="147" y="100" width="68" height="10" rx="3.5" className={styles.slot} />
          <rect x="147" y="116" width="68" height="10" rx="3.5" className={styles.slot} />

          <path d="M30 40v7m-3.5-3.5h7" className={styles.spark} />
          <circle cx="216" cy="152" r="2.2" className={styles.sparkDot} />
          <circle cx="120" cy="36" r="1.6" className={styles.soft} />
        </>
      ) : variant === 'not-found' ? (
        <>
          {/* A page, its address, and nothing there but the number… */}
          <Window x={26} y={32} w={188} h={124} shadow={shadow} />
          <rect x="66" y="36.5" width="108" height="10" rx="5" className={styles.tileCard} />
          <rect x="74" y="40" width="54" height="3" rx="1.5" className={styles.soft} />
          <text x="120" y="112" textAnchor="middle" className={styles.bigNumber} fill={`url(#${id}-ink)`}>
            404
          </text>
          <rect x="84" y="124" width="72" height="4" rx="2" className={styles.ink} />
          <rect x="98" y="133" width="44" height="4" rx="2" className={styles.soft} />

          {/* …and the way that led here, going round in circles. */}
          <path d="M164 148c22 2 30-14 20-22s-24 2-16 12 22 6 26-4" className={styles.path} />
          <g className={styles.wander}>
            <Cursor x={192} y={130} />
          </g>

          <path d="M20 58v7m-3.5-3.5h7" className={styles.spark} />
          <circle cx="222" cy="64" r="2.2" className={styles.sparkDot} />
          <circle cx="30" cy="150" r="1.6" className={styles.soft} />
        </>
      ) : (
        <>
          {/* A chart that came apart: one bar missing, fallen at the foot of the others. */}
          <Window x={28} y={40} w={170} h={116} shadow={shadow} />
          <rect x="40" y="67" width="50" height="5" rx="2.5" className={styles.inkStrong} />
          <path d="M40 87.5h146M40 112.5h146" className={styles.gridLine} />
          <path d="M40 140.5h146" className={styles.divider} />
          <rect x="48" y="102" width="15" height="38" rx="3" fill={bar(1)} />
          <rect x="71" y="88" width="15" height="52" rx="3" fill={bar(2)} />
          <rect x="94" y="96" width="15" height="44" rx="3" className={styles.slot} />
          <g transform="rotate(-7 136 132)">
            <rect x="114" y="125" width="44" height="14" rx="3" fill={bar(3)} />
          </g>
          <rect x="165" y="110" width="15" height="30" rx="3" fill={bar(1)} />
          <path d="M112 112l5-5M108 120l7-1" className={styles.jolt} />

          <g className={styles.float}>
            <circle cx="196" cy="42" r="17" className={styles.warningBack} filter={`url(#${shadow})`} />
            <path d="M196 32.5 205.5 50h-19Z" className={styles.warning} />
            <path d="M196 39v5" className={styles.warningMark} />
            <circle cx="196" cy="46.8" r="0.9" className={styles.warningDot} />
          </g>

          <path d="M20 74v7m-3.5-3.5h7" className={styles.spark} />
          <circle cx="218" cy="132" r="2.2" className={styles.sparkDot} />
          <circle cx="22" cy="146" r="1.6" className={styles.soft} />
        </>
      )}
    </svg>
  )
}
