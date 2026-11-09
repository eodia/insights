'use client'

import type { CustomColumn } from '@eodia/contracts'
import { SqlEditor } from '@/components/app/sql-editor'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { $t, msg } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Calendar, Calculator, GitBranch, Search, Sparkles, Type } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

/** A column of the source the expression can cite. */
export interface ExpressionColumn {
  readonly name: string
  readonly label: string
  readonly type: string
}

/** What a calculated column is often made of, with its fields to fill in (Tab to the next). */
const SNIPPETS: readonly { group: string; icon: typeof Calculator; items: readonly { label: string; hint: string; template: () => string }[] }[] = [
  {
    group: msg('Calculs'),
    icon: Calculator,
    items: [
      { label: msg('Division sans erreur'), hint: msg('Vide plutôt qu’une erreur quand le diviseur vaut zéro'), template: () => '${numerateur} / NULLIF(${diviseur}, 0)' },
      { label: msg('Pourcentage'), hint: msg('La part d’un total, en pourcentage'), template: () => '100.0 * ${part} / NULLIF(${total}, 0)' },
      { label: msg('Marge'), hint: msg('Un prix moins un coût, rapporté au prix'), template: () => '(${prix} - ${cout}) / NULLIF(${prix}, 0)' },
      { label: msg('Arrondi'), hint: msg('À deux décimales'), template: () => 'round(${valeur}, 2)' },
      { label: msg('Valeur par défaut'), hint: msg('Zéro à la place d’une valeur vide'), template: () => 'coalesce(${valeur}, 0)' },
    ],
  },
  {
    group: msg('Conditions'),
    icon: GitBranch,
    items: [
      {
        label: msg('Tranches'),
        hint: msg('Une étiquette selon la valeur'),
        template: () => `CASE\n  WHEN \${valeur} < \${100} THEN '${$t('Petit')}'\n  WHEN \${valeur} < \${1000} THEN '${$t('Moyen')}'\n  ELSE '${$t('Grand')}'\nEND`,
      },
      { label: msg('Si… alors… sinon'), hint: msg('Deux valeurs selon une condition'), template: () => 'if(${condition}, ${alors}, ${sinon})' },
      { label: msg('Tranches de dix'), hint: msg('0-9, 10-19… : des âges, des tailles'), template: () => "concat(CAST(floor(${age} / 10) * 10 AS varchar), '-', CAST(floor(${age} / 10) * 10 + 9 AS varchar))" },
    ],
  },
  {
    group: msg('Texte'),
    icon: Type,
    items: [
      { label: msg('Assembler'), hint: msg('Deux textes séparés par une espace'), template: () => "concat(${prenom}, ' ', ${nom})" },
      { label: msg('Majuscules'), hint: msg('Tout le texte en capitales'), template: () => 'upper(${texte})' },
      { label: msg('Début du texte'), hint: msg('Les premiers caractères'), template: () => 'substr(${texte}, 1, ${3})' },
      { label: msg('Domaine d’un e-mail'), hint: msg('Ce qui suit l’arobase'), template: () => "split_part(${email}, '@', 2)" },
    ],
  },
  {
    group: msg('Dates'),
    icon: Calendar,
    items: [
      { label: msg('Mois'), hint: msg('Le premier jour du mois de la date'), template: () => "date_trunc('month', ${date})" },
      { label: msg('Année'), hint: msg('L’année de la date'), template: () => 'year(${date})' },
      { label: msg('Écart en jours'), hint: msg('Les jours entre deux dates'), template: () => "date_diff('day', ${debut}, ${fin})" },
      { label: msg('Ancienneté en années'), hint: msg('Les années écoulées jusqu’à aujourd’hui'), template: () => "date_diff('year', ${date}, current_date)" },
      { label: msg('Jour de la semaine'), hint: msg('1 pour lundi, 7 pour dimanche'), template: () => 'day_of_week(${date})' },
    ],
  },
]

/**
 * A column computed on each row of the source, in Trino SQL, written in the SQL editor: its
 * columns completed as they are typed or inserted from the list, and the usual shapes —
 * division without error, share, bands, dates — ready to fill in. Its name is set once.
 */
export function ExpressionDialog({
  open,
  onOpenChange,
  initial,
  columns,
  taken,
  readOnly,
  onApply,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: CustomColumn
  columns: readonly ExpressionColumn[]
  taken: ReadonlySet<string>
  readOnly?: boolean
  onApply: (e: CustomColumn) => void
  onRemove?: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 p-0">
        {open ? <Body initial={initial} columns={columns} taken={taken} readOnly={readOnly} onApply={onApply} onRemove={onRemove} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function Body({
  initial,
  columns,
  taken,
  readOnly,
  onApply,
  onRemove,
  onClose,
}: {
  initial?: CustomColumn
  columns: readonly ExpressionColumn[]
  taken: ReadonlySet<string>
  readOnly?: boolean
  onApply: (e: CustomColumn) => void
  onRemove?: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [expression, setExpression] = useState(initial?.expression ?? '')
  const [side, setSide] = useState<'columns' | 'snippets'>('columns')
  const [filter, setFilter] = useState('')
  const editor = useRef<{ insert: (text: string) => void; snippet: (template: string) => void; focus: () => void } | null>(null)
  const validName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
  const clash = taken.has(name.toLowerCase())
  const ready = validName && !clash && expression.trim() !== ''
  const apply = () => {
    if (!ready || readOnly) return
    onApply({ name, expression: expression.trim() })
    onClose()
  }
  const words = useMemo(() => columns.map((c) => ({ label: c.name, detail: c.label === c.name ? c.type : c.label, type: 'property' })), [columns])
  const needle = filter.trim().toLocaleLowerCase()
  const listed = needle ? columns.filter((c) => c.name.toLowerCase().includes(needle) || c.label.toLocaleLowerCase().includes(needle)) : columns
  const snippets = SNIPPETS.map((g) => ({
    ...g,
    items: needle ? g.items.filter((it) => `${$t(g.group)} ${$t(it.label)} ${$t(it.hint)} ${it.template()}`.toLocaleLowerCase().includes(needle)) : g.items,
  })).filter((g) => g.items.length > 0)

  return (
    <form
      className="flex max-h-[85dvh] min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> {initial ? $t('Colonne calculée « {name} »', { name: initial.name }) : $t('Nouvelle colonne calculée')}
        </DialogTitle>
        <DialogDescription>{$t('Calculée pour chaque ligne à partir des colonnes de la source, elle sert ensuite comme les autres : filtre, mesure, regroupement.')}</DialogDescription>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-h-0 flex-col gap-4 p-6">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{$t('Nom')}</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="marge" disabled={!!initial || readOnly} autoFocus={!initial} className="h-9 max-w-sm font-mono" />
            {name && !validName ? (
              <p className="text-xs text-destructive">{$t('Lettres, chiffres et _ ; pas de chiffre au début.')}</p>
            ) : clash ? (
              <p className="text-xs text-destructive">{$t('Une colonne porte déjà ce nom.')}</p>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{$t('Expression Trino SQL')}</span>
              <span className="text-[11px] text-muted-foreground">{$t('Ctrl+Espace pour compléter · Tab pour le champ suivant · Ctrl+Entrée pour appliquer')}</span>
            </div>
            <div className={cn('h-64 overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-ring/40', readOnly && 'pointer-events-none opacity-80')}>
              <SqlEditor
                value={expression}
                onChange={setExpression}
                onRun={apply}
                words={words}
                bare
                placeholder="prix - cout"
                className="h-full"
                onReady={(api) => {
                  editor.current = api
                  if (initial) api.focus()
                }}
              />
            </div>
          </div>
        </div>

        <aside className="flex min-h-0 flex-col border-t bg-muted/30 md:border-t-0 md:border-l">
          {/* The application's tabs: a word, underlined when chosen. */}
          <div className="flex h-11 shrink-0 items-center gap-5 border-b px-4 text-sm">
            {(
              [
                ['columns', $t('Colonnes')],
                ['snippets', $t('Modèles')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSide(key)
                  setFilter('')
                }}
                className={cn('relative py-3', side === key ? 'font-semibold text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary' : 'text-muted-foreground hover:text-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative px-2 pt-2 pb-2">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={side === 'columns' ? $t('Chercher une colonne') : $t('Chercher un modèle')} className="h-8 pl-7 text-xs" />
          </div>
          {side === 'columns' ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 md:max-h-none">
                {listed.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    disabled={readOnly}
                    onClick={() => editor.current?.insert(c.name)}
                    className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left hover:bg-background"
                    title={$t('Insérer « {column} »', { column: c.name })}
                  >
                    <span className="truncate font-mono text-xs text-foreground">{c.name}</span>
                    {c.label !== c.name ? <span className="ml-auto truncate text-[11px] text-muted-foreground">{c.label}</span> : null}
                  </button>
                ))}
                {listed.length === 0 ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">{$t('Aucune colonne ne correspond.')}</p> : null}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
              {snippets.map((g) => (
                <div key={g.group} className="space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2 pt-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <g.icon className="size-3" /> {$t(g.group)}
                  </div>
                  {g.items.map((it) => (
                    <button key={it.label} type="button" disabled={readOnly} onClick={() => editor.current?.snippet(it.template())} className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-background">
                      <span className="block text-xs font-medium text-foreground">{$t(it.label)}</span>
                      <span className="block text-[11px] text-muted-foreground">{$t(it.hint)}</span>
                    </button>
                  ))}
                </div>
              ))}
              {snippets.length === 0 ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">{$t('Aucun modèle ne correspond.')}</p> : null}
            </div>
          )}
        </aside>
      </div>

      <div className="flex items-center gap-2 border-t px-6 py-3">
        {onRemove && !readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              onRemove()
              onClose()
            }}
          >
            {$t('Retirer')}
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          {readOnly ? $t('Fermer') : $t('Annuler')}
        </Button>
        {readOnly ? null : (
          <Button type="submit" size="sm" disabled={!ready}>
            {initial ? $t('Appliquer') : $t('Ajouter')}
          </Button>
        )}
      </div>
    </form>
  )
}
