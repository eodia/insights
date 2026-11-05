'use client'

import type { AppNotification } from '@eodia/contracts'
import { Avatar } from '@/components/app/look'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Hint } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AtSign, Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const KEY = ['notifications'] as const

/**
 * The bell of the top bar: who called on the person (« @Marie ») and where — a dot while some
 * are unread. Opening it reads them; one opens the dashboard or the question it is about.
 */
export function NotificationsBell() {
  const qc = useQueryClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { data } = useQuery({ queryKey: KEY, queryFn: () => api.get<{ items: AppNotification[]; unread: number }>('/v1/notifications'), refetchInterval: 60_000 })
  const unread = data?.unread ?? 0
  const items = data?.items ?? []
  const go = (n: AppNotification) => {
    setOpen(false)
    if (n.dashboard) router.push(`/dashboard/${n.dashboard.id}`)
    else if (n.question) router.push(`/question/${n.question.id}`)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        // Seen once opened: read.
        if (o && unread) void api.post('/v1/notifications/read', {}).then(() => qc.invalidateQueries({ queryKey: KEY }))
      }}
    >
      <Hint label={unread ? $t('{count} nouvelle(s) mention(s)', { count: unread }) : $t('Notifications')}>
        <PopoverTrigger asChild>
          <button type="button" aria-label={$t('Notifications')} className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Bell className="size-[18px]" />
            {unread ? (
              <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-4 font-semibold text-white tabular-nums">{unread > 9 ? '9+' : unread}</span>
            ) : null}
          </button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-4 py-3 text-sm font-semibold">{$t('Notifications')}</div>
        <div className="max-h-96 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
              <AtSign className="size-5" />
              {$t('Quand quelqu’un vous mentionne dans un commentaire ou une annotation, c’est ici.')}
            </div>
          ) : null}
          {items.map((n) => (
            <button key={n.id} type="button" onClick={() => go(n)} className={cn('flex w-full gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-muted/70', !n.read && 'bg-primary/[0.05]')}>
              {n.actor ? <Avatar name={n.actor.name} color={n.actor.color} size="sm" /> : <span className="size-6 shrink-0 rounded-full bg-muted" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-snug">
                  <span className="font-semibold">{n.actor?.name ?? $t('Quelqu’un')}</span> {$t('vous a mentionné sur')} <span className="font-medium">« {n.dashboard?.name ?? n.question?.name ?? ''} »</span>
                </span>
                <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.excerpt}</span>
                <span className="mt-1 block text-[11px] text-muted-foreground/80">{formatAgo(n.created_at)}</span>
              </span>
              {!n.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
