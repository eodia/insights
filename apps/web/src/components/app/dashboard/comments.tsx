'use client'

import type { Annotation, CardComment } from '@eodia/contracts'
import { Avatar } from '@/components/app/look'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Hint } from '@/components/ui/tooltip'
import { LOOK_HEX, formatAgo } from '@/lib/format'
import { $t, $tp, intlLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { MentionText, useMentions } from '@/components/app/mentions'
import { Flag, Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

/**
 * What people say of a card: its comments, oldest first, and the dates marked on its chart —
 * a bubble in its header, with how many there are.
 */
export function CommentsButton({
  comments,
  annotations,
  onAdd,
  onDelete,
  onDeleteAnnotation,
}: {
  comments: readonly CardComment[]
  annotations: readonly Annotation[]
  onAdd: (body: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onDeleteAnnotation: (id: string) => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const mentions = useMentions(body, setBody)
  const count = comments.length
  const send = async () => {
    if (!body.trim()) return
    setBusy(true)
    try {
      await onAdd(mentions.encode(body.trim()))
      setBody('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Popover>
      <Hint label={count ? $tp(count, '{count} commentaire', '{count} commentaires') : $t('Commenter')}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'card-still inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:opacity-100',
              count || annotations.length ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
            aria-label={$t('Commentaires')}
          >
            <MessageSquare className="size-3.5" />
            {count ? <span className="tabular-nums">{count}</span> : null}
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="max-h-80 space-y-3 overflow-y-auto p-3">
          {comments.length === 0 ? <p className="text-xs text-muted-foreground">{$t('Aucun commentaire. Expliquez un chiffre, une baisse, une anomalie : tous ceux qui ouvrent le tableau le liront.')}</p> : null}
          {comments.map((c) => (
            <div key={c.id} className="group/comment flex gap-2">
              {c.author ? <Avatar name={c.author.name} color={c.author.color} size="sm" /> : <span className="size-6 shrink-0 rounded-full bg-muted" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 text-xs">
                  <span className="truncate font-medium">{c.author?.name ?? $t('Ancien membre')}</span>
                  <span className="shrink-0 text-muted-foreground">{formatAgo(c.created_at)}</span>
                  <span className="flex-1" />
                  {c.mine ? (
                    <button type="button" onClick={() => void onDelete(c.id)} className="opacity-0 group-hover/comment:opacity-100" aria-label={$t('Supprimer le commentaire')}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </button>
                  ) : null}
                </div>
                <MentionText text={c.body} className="block text-sm break-words whitespace-pre-wrap" />
              </div>
            </div>
          ))}
          {annotations.length ? (
            <div className="space-y-1.5 border-t pt-3">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{$t('Annotations du graphique')}</div>
              {annotations.map((a) => (
                <div key={a.id} className="group/annotation flex items-center gap-2 text-xs">
                  <Flag className="size-3.5 shrink-0" style={{ color: a.color ?? undefined }} />
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {new Date(`${a.at}T00:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short', year: 'numeric' })}
                    {a.end ? ` → ${new Date(`${a.end}T00:00:00`).toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })}` : ''}
                  </span>
                  <MentionText text={a.label} className="min-w-0 flex-1 truncate" />
                  {a.mine ? (
                    <button type="button" onClick={() => void onDeleteAnnotation(a.id)} className="opacity-0 group-hover/annotation:opacity-100" aria-label={$t('Supprimer l’annotation')}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <form
          className="flex flex-col gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <div className="relative">
            {mentions.menu}
            <Textarea
              ref={mentions.field}
              value={body}
              onChange={mentions.onChange}
              onKeyDown={(e) => {
                if (mentions.onKeyDown(e)) return
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={$t('Baisse due à la grève du 12… — @ pour mentionner quelqu’un')}
              className="min-h-16 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11px] text-muted-foreground">{$t('@ mentionne · Ctrl + Entrée envoie')}</span>
            <Button type="submit" size="sm" disabled={!body.trim() || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {$t('Commenter')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

const ANNOTATION_COLORS = ['#3f3f46', LOOK_HEX.red, LOOK_HEX.orange, LOOK_HEX.green, LOOK_HEX.blue, LOOK_HEX.violet] as const

/** « Annoter ce point » : a label on a date — or a span — of the chart, seen by everyone. */
export function AnnotateDialog({ at, onClose, onSave }: { at: string; onClose: () => void; onSave: (a: { at: string; end: string | null; label: string; color: string }) => Promise<void> }) {
  const [label, setLabel] = useState('')
  const mentions = useMentions(label, setLabel)
  const [from, setFrom] = useState(at)
  const [to, setTo] = useState('')
  const [color, setColor] = useState<string>(ANNOTATION_COLORS[1])
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      await onSave({ at: from, end: to || null, label: mentions.encode(label.trim()), color })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{$t('Annoter le graphique')}</DialogTitle>
          <DialogDescription>{$t('Un repère sur la courbe, à cette date ou sur une période — vu de tous, partout où ce graphique s’affiche.')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (label.trim()) void save()
          }}
        >
          <div className="relative">
            {mentions.menu}
            <Input
              ref={mentions.field}
              autoFocus
              value={label}
              onChange={mentions.onChange}
              onKeyDown={(e) => void mentions.onKeyDown(e)}
              placeholder={$t('Grève du 12, lancement de la campagne… — @ pour mentionner')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{$t('Le')}</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{$t('Jusqu’au (facultatif)')}</Label>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-8" />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {ANNOTATION_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={cn('size-6 rounded-full border-2', color === c ? 'border-foreground' : 'border-transparent')} style={{ background: c }} aria-label={c} />
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {$t('Annuler')}
            </Button>
            <Button type="submit" disabled={!label.trim() || !from || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Flag />}
              {$t('Annoter')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
