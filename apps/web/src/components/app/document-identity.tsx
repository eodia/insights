'use client'

import type { Workspace } from '@eodia/contracts'
import { LOOK_HEX } from '@/lib/format'
import { ownIdentity, projectName } from '@/lib/project'
import { useUi } from '@/lib/store'
import { dynamicIconImports } from 'lucide-react/dynamic'
import { useEffect } from 'react'

const SIZE = 64

/** The breadcrumb as a tab title: the page, then what holds it, then the project. */
function titleOf(labels: readonly string[], project: string): string {
  const shown = labels.filter((l) => l && l !== '…')
  const page = shown.slice(-2).reverse().join(' · ')
  return page ? `${page} — ${project}` : project
}

function load(src: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (cors) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image illisible : ${src.slice(0, 60)}`))
    img.src = src
  })
}

/** A lucide pictogram, white, as an SVG to draw: its shapes come from the icon's module. */
async function lucideSvg(name: string): Promise<string | null> {
  const importer = (dynamicIconImports as Record<string, (() => Promise<unknown>) | undefined>)[name]
  if (!importer) return null
  const mod = (await importer()) as { __iconData?: { node: [string, Record<string, string>][] } }
  const node = mod.__iconData?.node
  if (!node) return null
  const shapes = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ')}/>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/**
 * The project's favicon: its image, or its pictogram on its colour — with, in the corner, the
 * mint dot of the eodia insights mark on its dark green, so the tab still says « insights ».
 */
async function faviconOf(workspace: Pick<Workspace, 'icon' | 'color'>): Promise<string | null> {
  const icon = workspace.icon ?? ''
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const hue = LOOK_HEX[workspace.color ?? 'green']

  roundedRect(ctx, 0, 0, SIZE, SIZE, 14)
  ctx.save()
  ctx.clip()
  if (icon.startsWith('img:')) {
    const src = icon.slice(4)
    const img = await load(src, !src.startsWith('data:'))
    // The picture fills the square, cropped to its middle.
    const scale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
  } else {
    ctx.fillStyle = hue
    ctx.fillRect(0, 0, SIZE, SIZE)
    if (icon.startsWith('emoji:')) {
      ctx.font = `${SIZE * 0.6}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(icon.slice(6), SIZE / 2, SIZE / 2 + 3)
    } else {
      const svg = await lucideSvg(icon)
      if (!svg) return null
      const img = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, false)
      ctx.drawImage(img, 12, 12, SIZE - 24, SIZE - 24)
    }
  }
  ctx.restore()

  // The insights mark: its mint dot on its dark green, ringed so it reads on any picture.
  ctx.beginPath()
  ctx.arc(SIZE - 13, 13, 12, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(SIZE - 13, 13, 10, 0, Math.PI * 2)
  ctx.fillStyle = '#104832'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(SIZE - 13, 13, 5.5, 0, Math.PI * 2)
  ctx.fillStyle = '#76cf98'
  ctx.fill()
  // An image from another site without CORS taints the canvas: then no favicon of ours.
  return canvas.toDataURL('image/png')
}

/** Points every icon link of the page at `href`, or back at the one the page came with. */
function setFavicon(href: string | null) {
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')) {
    if (!link.dataset.original) link.dataset.original = link.getAttribute('href') ?? ''
    link.href = href ?? link.dataset.original
  }
}

/**
 * The browser tab of the application: titled after the breadcrumb and the project, and, when the
 * space has a face of its own, wearing it as favicon.
 */
export function DocumentIdentity({ workspace }: { workspace: Pick<Workspace, 'name' | 'icon' | 'color'> | null | undefined }) {
  const crumbs = useUi((s) => s.crumbs)
  const project = projectName(workspace)
  const title = titleOf(
    crumbs.map((c) => c.label),
    project,
  )

  useEffect(() => {
    document.title = title
    // Next sets the title of the page on its own: ours comes back whenever it is changed.
    const head = document.querySelector('head')
    if (!head) return
    const observer = new MutationObserver(() => {
      if (document.title !== title) document.title = title
    })
    observer.observe(head, { subtree: true, childList: true, characterData: true })
    return () => observer.disconnect()
  }, [title])

  const icon = ownIdentity(workspace) ? (workspace?.icon ?? null) : null
  const color = workspace?.color ?? null
  useEffect(() => {
    if (!icon) {
      setFavicon(null)
      return
    }
    let live = true
    faviconOf({ icon, color })
      .catch(() => null)
      .then((href) => {
        if (!live) return
        // An image the canvas may not read is still the project's: shown as it is.
        setFavicon(href ?? (icon.startsWith('img:') ? icon.slice(4) : null))
      })
    return () => {
      live = false
    }
  }, [icon, color])

  return null
}
