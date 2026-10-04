'use client'

import { cn } from '@/lib/utils'
import { useId } from 'react'
import styles from './browse-illustration.module.css'

/** Decorative scenes for the browser's empty list and preview pane. */
export function BrowseIllustration({
  variant,
  className,
}: {
  variant: 'folder' | 'preview'
  className?: string
}) {
  const id = useId()

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 240 180"
      width="240"
      height="180"
      fill="none"
      className={cn(styles.scene, className)}
    >
      <defs>
        <radialGradient id={`${id}-halo`}>
          <stop className={styles.haloCenter} />
          <stop offset="1" className={styles.haloEdge} />
        </radialGradient>
        <linearGradient
          id={`${id}-front`}
          x1="120"
          y1="93"
          x2="120"
          y2="151"
          gradientUnits="userSpaceOnUse"
        >
          <stop className={styles.frontTop} />
          <stop offset="1" className={styles.frontBottom} />
        </linearGradient>
      </defs>

      <ellipse cx="120" cy="92" rx="108" ry="80" fill={`url(#${id}-halo)`} />
      <ellipse cx="120" cy="94" rx="91" ry="63" className={styles.orbit} strokeDasharray="2 7" />
      <ellipse cx="122" cy="158" rx="61" ry="5" className={styles.shadow} />

      {variant === 'folder' ? (
        <g className={styles.float}>
          {/* The back remains behind the floating sheet and the open front. */}
          <path
            d="M60 139V72a9 9 0 0 1 9-9h29l10 11h64a9 9 0 0 1 9 9v56a10 10 0 0 1-10 10H70a10 10 0 0 1-10-10Z"
            className={styles.folderBack}
          />
          <g className={styles.sheet}>
            <g transform="rotate(8 124 89)">
              <path
                d="M96 45h39l17 17v66H96a5 5 0 0 1-5-5V50a5 5 0 0 1 5-5Z"
                className={styles.paper}
              />
              <path d="M135 45v13a4 4 0 0 0 4 4h13" className={styles.fold} />
              <path d="M103 76h25m-25 10h33m-33 10h19" className={styles.paperLines} />
            </g>
          </g>
          <path
            d="M54 99a7 7 0 0 1 7-8h117a7 7 0 0 1 7 8l-7 40a12 12 0 0 1-12 10H73a12 12 0 0 1-12-10Z"
            fill={`url(#${id}-front)`}
            className={styles.folderFront}
          />
          <path d="M77 135h85" className={styles.folderSeam} />
          <rect x="105" y="108" width="28" height="5" rx="2.5" className={styles.folderLabel} />
        </g>
      ) : (
        <>
          <g transform="rotate(-7 78 100)">
            <rect x="36" y="61" width="67" height="86" rx="9" className={styles.backCard} />
            <rect x="46" y="73" width="22" height="4" rx="2" className={styles.softFill} />
            <path d="M46 89h42m-42 11h31m-31 11h37" className={styles.paperLines} />
          </g>
          <g className={styles.float}>
            <rect x="77" y="42" width="128" height="102" rx="11" className={styles.paper} />
            <path d="M77 64h128" className={styles.divider} />
            <circle cx="89" cy="53" r="2" className={styles.accentFill} />
            <circle cx="97" cy="53" r="2" className={styles.softFill} />
            <circle cx="105" cy="53" r="2" className={styles.softFill} />
            <rect x="89" y="76" width="35" height="4" rx="2" className={styles.softFill} />
            <rect x="89" y="85" width="22" height="3" rx="1.5" className={styles.faintFill} />
            <rect x="89" y="100" width="21" height="28" rx="4" className={styles.chartTile} />
            <path d="M96 121v-8m7 8v-13" className={styles.miniChart} />
            <path d="M127 128h63" className={styles.divider} />
            <g className={styles.bars}>
              <rect x="130" y="105" width="10" height="19" rx="3" className={styles.barSoft} />
              <rect x="147" y="92" width="10" height="32" rx="3" className={styles.barMedium} />
              <rect x="164" y="99" width="10" height="25" rx="3" className={styles.barSoft} />
              <rect x="181" y="80" width="10" height="44" rx="3" className={styles.barMedium} />
            </g>
          </g>
          <g className={styles.cursor}>
            <path d="m176 130 5 28 7-8 10 1Z" className={styles.cursorShape} />
            <path d="m189 153 4 7" className={styles.cursorStem} />
          </g>
        </>
      )}

      <g className={styles.spark}>
        <path d="M193 33v10m-5-5h10" className={styles.sparkLines} />
        <circle cx="42" cy="111" r="2.5" className={styles.accentFill} />
      </g>
      <circle cx="57" cy="40" r="2" className={styles.softFill} />
      <path d="M211 101v6m-3-3h6" className={styles.quietSpark} />
    </svg>
  )
}
