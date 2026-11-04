/**
 * The search and replace panel of the code editors, drawn as the rest of insights: a field with
 * its glass, toggles for the case, the whole word and the expression, where the match is among
 * how many, and the replace line folded until asked. CodeMirror's commands do the work.
 */
import { $t } from '@/lib/i18n'
import { SearchQuery, closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, setSearchQuery } from '@codemirror/search'
import type { EditorState } from '@codemirror/state'
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view'

/** Lucide's paths, 24 × 24, stroked. */
const ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  replace: '<path d="M14 4c0-1.1.9-2 2-2"/><path d="M20 2c1.1 0 2 .9 2 2"/><path d="M22 8c0 1.1-.9 2-2 2"/><path d="M16 10c-1.1 0-2-.9-2-2"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5c0-1.7 1.3-3 3-3h1"/><rect width="8" height="8" x="2" y="14" rx="2"/>',
  replaceAll: '<path d="M14 14a2 2 0 0 1 2-2"/><path d="M14 4a2 2 0 0 1 2-2"/><path d="M16 10a2 2 0 0 1-2-2"/><path d="M20 14a2 2 0 0 1 2 2"/><path d="M20 2a2 2 0 0 1 2 2"/><path d="M22 8a2 2 0 0 1-2 2"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5a3 3 0 0 1 3-3h1"/><rect x="2" y="14" width="8" height="8" rx="2"/>',
} as const

function svg(name: keyof typeof ICONS, size = 14): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, attrs: Record<string, string> = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

const FIELD = 'h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'
const ICON_BUTTON = 'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40'
const TOGGLE = 'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1 font-mono text-[11px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-primary/12 aria-pressed:text-primary'
const TEXT_BUTTON = 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40'

/** Where the selection is among the matches, and how many there are — counted up to a limit. */
function countOf(state: EditorState, query: SearchQuery): { at: number; total: number; capped: boolean } {
  if (!query.valid) return { at: 0, total: 0, capped: false }
  const LIMIT = 1000
  const cursor = query.getCursor(state)
  const { from, to } = state.selection.main
  let total = 0
  let at = 0
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total++
    if (next.value.from === from && next.value.to === to) at = total
    if (total >= LIMIT) return { at, total, capped: true }
  }
  return { at, total, capped: false }
}

export function searchPanel(view: EditorView): Panel {
  const initial = getSearchQuery(view.state)
  let showReplace = initial.replace !== ''

  const dom = el('div', 'eodia-search flex flex-col gap-1.5 border-b bg-muted/40 px-2 py-1.5 text-xs', { role: 'search', 'aria-label': $t('Rechercher dans le code') })
  const top = el('div', 'flex items-center gap-1')
  const fold = el('button', ICON_BUTTON, { type: 'button', 'aria-label': $t('Remplacer'), title: $t('Remplacer') })
  fold.innerHTML = svg('chevron')
  const box = el('div', 'relative flex min-w-0 flex-1 items-center')
  const glass = el('span', 'pointer-events-none absolute left-2 text-muted-foreground')
  glass.innerHTML = svg('search', 13)
  const field = el('input', `${FIELD} pr-28 pl-7`, { type: 'text', placeholder: $t('Rechercher'), 'aria-label': $t('Rechercher'), 'main-field': 'true', spellcheck: 'false' })
  field.value = initial.search
  const toggles = el('div', 'absolute right-1 flex items-center gap-0.5')
  const toggle = (label: string, title: string, on: boolean) => {
    const b = el('button', TOGGLE, { type: 'button', title, 'aria-label': title, 'aria-pressed': String(on) })
    b.textContent = label
    toggles.append(b)
    return b
  }
  const caseBtn = toggle('Aa', $t('Respecter la casse'), initial.caseSensitive)
  const wordBtn = toggle('ab', $t('Mot entier'), initial.wholeWord)
  wordBtn.innerHTML = '<span class="underline decoration-1 underline-offset-2">ab</span>'
  const regexpBtn = toggle('.*', $t('Expression régulière'), initial.regexp)
  box.append(glass, field, toggles)
  const count = el('span', 'w-16 shrink-0 text-center text-[11px] text-muted-foreground tabular-nums', { 'aria-live': 'polite' })
  const prev = el('button', ICON_BUTTON, { type: 'button', title: `${$t('Précédent')} (Maj+Entrée)`, 'aria-label': $t('Précédent') })
  prev.innerHTML = svg('up')
  const next = el('button', ICON_BUTTON, { type: 'button', title: `${$t('Suivant')} (Entrée)`, 'aria-label': $t('Suivant') })
  next.innerHTML = svg('down')
  const close = el('button', ICON_BUTTON, { type: 'button', title: `${$t('Fermer')} (Échap)`, 'aria-label': $t('Fermer') })
  close.innerHTML = svg('close')
  top.append(fold, box, count, prev, next, close)

  const bottom = el('div', 'flex items-center gap-1 pl-8')
  const replaceField = el('input', FIELD, { type: 'text', placeholder: $t('Remplacer par'), 'aria-label': $t('Remplacer par'), spellcheck: 'false' })
  replaceField.value = initial.replace
  const replaceOne = el('button', TEXT_BUTTON, { type: 'button', title: $t('Remplacer la prochaine occurrence') })
  replaceOne.innerHTML = `${svg('replace', 13)}<span>${$t('Remplacer')}</span>`
  const replaceEvery = el('button', TEXT_BUTTON, { type: 'button', title: $t('Remplacer toutes les occurrences') })
  replaceEvery.innerHTML = `${svg('replaceAll', 13)}<span>${$t('Tout remplacer')}</span>`
  bottom.append(replaceField, replaceOne, replaceEvery)
  dom.append(top, bottom)

  const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed') === 'true'
  const commit = () => {
    const query = new SearchQuery({ search: field.value, caseSensitive: pressed(caseBtn), wholeWord: pressed(wordBtn), regexp: pressed(regexpBtn), replace: replaceField.value })
    if (!query.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(query) })
  }
  const layout = () => {
    bottom.hidden = !showReplace
    fold.firstElementChild?.setAttribute('style', `transition: transform .15s; transform: rotate(${showReplace ? 90 : 0}deg)`)
    fold.setAttribute('aria-expanded', String(showReplace))
    replaceField.disabled = view.state.readOnly
  }
  const refresh = (state: EditorState) => {
    const query = getSearchQuery(state)
    const { at, total, capped } = countOf(state, query)
    const empty = query.search === ''
    count.textContent = empty ? '' : !query.valid ? $t('Invalide') : total === 0 ? $t('Aucun') : `${at || '–'} / ${total}${capped ? '+' : ''}`
    count.classList.toggle('text-destructive', !empty && (!query.valid || total === 0))
    for (const b of [prev, next, replaceOne, replaceEvery]) b.disabled = empty || total === 0
  }

  field.addEventListener('input', commit)
  replaceField.addEventListener('input', commit)
  for (const b of [caseBtn, wordBtn, regexpBtn]) {
    b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', String(!pressed(b)))
      commit()
      field.focus()
    })
  }
  fold.addEventListener('click', () => {
    showReplace = !showReplace
    layout()
    ;(showReplace ? replaceField : field).focus()
  })
  prev.addEventListener('click', () => findPrevious(view))
  next.addEventListener('click', () => findNext(view))
  close.addEventListener('click', () => closeSearchPanel(view))
  replaceOne.addEventListener('click', () => replaceNext(view))
  replaceEvery.addEventListener('click', () => replaceAll(view))
  dom.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === field) {
      e.preventDefault()
      ;(e.shiftKey ? findPrevious : findNext)(view)
    } else if (e.key === 'Enter' && e.target === replaceField) {
      e.preventDefault()
      ;(e.ctrlKey || e.metaKey ? replaceAll : replaceNext)(view)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeSearchPanel(view)
    }
  })

  layout()
  refresh(view.state)
  return {
    dom,
    top: true,
    mount: () => {
      field.focus()
      field.select()
    },
    update: (u: ViewUpdate) => {
      const query = getSearchQuery(u.state)
      if (!query.eq(getSearchQuery(u.startState))) {
        if (field.value !== query.search) field.value = query.search
        if (replaceField.value !== query.replace) replaceField.value = query.replace
        caseBtn.setAttribute('aria-pressed', String(query.caseSensitive))
        wordBtn.setAttribute('aria-pressed', String(query.wholeWord))
        regexpBtn.setAttribute('aria-pressed', String(query.regexp))
      }
      if (u.docChanged || u.selectionSet || !query.eq(getSearchQuery(u.startState))) refresh(u.state)
    },
  }
}
