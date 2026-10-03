'use client'

import { ConfirmDialog } from '@/components/app/dialogs'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

export interface ConversationSummary {
  readonly id: string
  readonly title: string
  readonly updated_at: string
}

export const CONVERSATIONS_KEY = ['assistant-conversations'] as const

/** Conversations by age: today, yesterday, this week, this month, before. */
function groups(list: readonly ConversationSummary[]) {
  const day = 86_400_000
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const today = start.getTime()
  const out: { label: string; items: ConversationSummary[] }[] = [
    { label: $t('Aujourd’hui'), items: [] },
    { label: $t('Hier'), items: [] },
    { label: $t('7 derniers jours'), items: [] },
    { label: $t('30 derniers jours'), items: [] },
    { label: $t('Plus ancien'), items: [] },
  ]
  for (const c of list) {
    const t = new Date(c.updated_at).getTime()
    const i =
      t >= today
        ? 0
        : t >= today - day
          ? 1
          : t >= today - 7 * day
            ? 2
            : t >= today - 30 * day
              ? 3
              : 4
    out[i]?.items.push(c)
  }
  return out.filter((g) => g.items.length > 0)
}

function Item({
  c,
  active,
  onOpen,
}: { c: ConversationSummary; active: boolean; onOpen: () => void }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(c.title)
  const [remove, setRemove] = useState(false)
  const save = async () => {
    setEditing(false)
    const t = title.trim()
    if (!t || t === c.title) return setTitle(c.title)
    await api.patch(`/v1/copilot/conversations/${c.id}`, { title: t })
    await qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
  }
  return (
    <div
      className={cn(
        'group relative flex items-center rounded-lg text-sm transition-colors',
        active
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
      )}
    >
      {active ? (
        <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary" />
      ) : null}
      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: the field appears on the click that asks for it
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setTitle(c.title)
              setEditing(false)
            }
          }}
          aria-label={$t('Titre de la conversation')}
          className="mx-1 my-0.5 h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onOpen}
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate px-3 py-2 text-left"
        >
          {c.title}
        </button>
      )}
      {!editing ? (
        <span className="absolute right-1 flex gap-0.5 rounded-md bg-gradient-to-l from-accent from-60% pl-4 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded p-1 hover:bg-background"
            aria-label={$t('Renommer')}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setRemove(true)}
            className="rounded p-1 hover:bg-background hover:text-destructive"
            aria-label={$t('Supprimer')}
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      ) : null}
      <ConfirmDialog
        open={remove}
        onOpenChange={setRemove}
        title={$t('Supprimer « {name} » ?', { name: c.title })}
        description={$t('La conversation et ses graphiques disparaissent de votre historique.')}
        onConfirm={async () => {
          await api.delete(`/v1/copilot/conversations/${c.id}`)
          await qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY })
        }}
      />
    </div>
  )
}

/** The person's conversations with the assistant: searched, grouped by age, renamed, deleted. */
export function History({
  list,
  current,
  onOpen,
  onNew,
}: {
  list: readonly ConversationSummary[]
  current: string | null
  onOpen: (id: string) => void
  onNew: () => void
}) {
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const f = q.trim().toLowerCase()
    return groups(f ? list.filter((c) => c.title.toLowerCase().includes(f)) : list)
  }, [list, q])
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-muted/20">
      <div className="space-y-2 p-3">
        <Button onClick={onNew} className="w-full justify-start gap-2 rounded-xl shadow-sm">
          <Plus /> {$t('Nouvelle conversation')}
        </Button>
        <label className="flex h-8 items-center gap-2 rounded-lg border bg-background px-2.5 text-sm focus-within:ring-2 focus-within:ring-ring/40">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={$t('Rechercher une conversation')}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 pt-10 text-center text-xs text-muted-foreground">
            <MessageSquare className="size-5 opacity-60" />
            {q
              ? $t('Aucune conversation ne correspond.')
              : $t('Vos conversations s’affichent ici : elles sont gardées pour vous seul.')}
          </div>
        ) : (
          shown.map((g) => (
            <div key={g.label} className="space-y-0.5">
              <div className="px-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">
                {g.label}
              </div>
              {g.items.map((c) => (
                <Item key={c.id} c={c} active={c.id === current} onOpen={() => onOpen(c.id)} />
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
