'use client'

import type { Alert, Subscription } from '@eodia/contracts'
import { Empty, PageHeader, Spinner } from '@/components/app/admin/common'
import { AlertRow, AlertsDialog } from '@/components/app/delivery/alerts'
import { SubscriptionForm, SubscriptionRow, useDelivery } from '@/components/app/delivery/subscriptions'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { api } from '@/lib/api'
import { $t } from '@/lib/i18n'
import { useDashboard } from '@/lib/queries'
import { useCrumbs } from '@/lib/store'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, Loader2, Mail, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

/** A subscription changed from this page: its dashboard read first, for its tabs and filters. */
function EditSubscription({ subscription, onClose }: { subscription: Subscription; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: dashboard } = useDashboard(subscription.dashboard)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {dashboard ? (
          <SubscriptionForm
            dashboard={dashboard}
            values={subscription.values}
            subscription={subscription}
            onDone={async () => {
              await qc.invalidateQueries({ queryKey: ['subscriptions'] })
              onClose()
            }}
            onCancel={onClose}
          />
        ) : (
          <Loader2 className="mx-auto my-10 size-5 animate-spin text-muted-foreground" />
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function DeliveriesPage() {
  useCrumbs([{ label: $t('Abonnements et alertes') }])
  const qc = useQueryClient()
  const [tab, setTab] = useState<'subscriptions' | 'alerts'>('subscriptions')
  const { data: can } = useDelivery()
  const subscriptions = useQuery({ queryKey: ['subscriptions', 'all'], queryFn: () => api.get<Subscription[]>('/v1/subscriptions') })
  const alerts = useQuery({ queryKey: ['alerts', 'all'], queryFn: () => api.get<Alert[]>('/v1/alerts') })
  const [editSub, setEditSub] = useState<Subscription | null>(null)
  const [editAlert, setEditAlert] = useState<Alert | null>(null)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['subscriptions'] }), qc.invalidateQueries({ queryKey: ['alerts'] })])

  return (
    <div className="mx-auto max-w-4xl px-8 py-6">
      <PageHeader
        title={$t('Abonnements et alertes')}
        description={$t('Ce qui part tout seul : les tableaux de bord envoyés à heure fixe, et les questions qui vous préviennent quand elles disent quelque chose.')}
        actions={
          <Segmented
            value={tab}
            onValueChange={setTab}
            aria-label={$t('Vue')}
            inline
            options={[
              { value: 'subscriptions', label: $t('Abonnements ({n})', { n: subscriptions.data?.length ?? 0 }), icon: Mail },
              { value: 'alerts', label: $t('Alertes ({n})', { n: alerts.data?.length ?? 0 }), icon: BellRing },
            ]}
          />
        }
      />
      {can && (!can.email || !can.render) ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <TriangleAlert className="mt-px size-4 shrink-0" />
          <span>
            {!can.email ? $t('Aucun serveur d’e-mails n’est configuré (SMTP_URL) : les envois ne partent que vers Teams et Slack.') : null}{' '}
            {!can.render ? $t('Aucun service de rendu (RENDER_URL) : les tableaux de bord partent en résumé écrit plutôt qu’en PDF ou en image.') : null}
          </span>
        </p>
      ) : null}
      {tab === 'subscriptions' ? (
        subscriptions.isLoading ? (
          <Spinner />
        ) : subscriptions.data?.length ? (
          <div className="space-y-2">
            {subscriptions.data.map((s) => (
              <SubscriptionRow key={s.id} subscription={s} showDashboard onEdit={() => setEditSub(s)} onChanged={refresh} />
            ))}
          </div>
        ) : (
          <Empty icon={<Mail className="size-5" />} title={$t('Aucun abonnement')}>
            {$t('Depuis un tableau de bord, menu « ⋯ » › « Abonnements… » : chaque lundi à 8 h, en PDF, à toute l’équipe.')}
          </Empty>
        )
      ) : alerts.isLoading ? (
        <Spinner />
      ) : alerts.data?.length ? (
        <div className="space-y-2">
          {alerts.data.map((a) => (
            <AlertRow key={a.id} alert={a} showQuestion onEdit={() => setEditAlert(a)} onChanged={refresh} />
          ))}
        </div>
      ) : (
        <Empty icon={<BellRing className="size-5" />} title={$t('Aucune alerte')}>
          {$t('Depuis une question ou une carte, menu « ⋯ » › « Alertes… » : prévenez-moi si le CA du jour passe sous 10 k€.')}
        </Empty>
      )}
      {editSub ? <EditSubscription subscription={editSub} onClose={() => setEditSub(null)} /> : null}
      {editAlert ? <AlertsDialog question={{ id: editAlert.question, name: editAlert.question_name }} onClose={() => setEditAlert(null)} /> : null}
    </div>
  )
}
