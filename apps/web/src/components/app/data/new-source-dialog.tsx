'use client'

import type { Datasource, Engine } from '@eodia/contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { $t } from '@/lib/i18n'
import { keys, useEngines } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SourceForm } from './source-form'
import { EngineBadge } from './source-look'

const ENGINE_HINTS: Partial<Record<Engine, string>> = {
  postgresql: 'Pilote natif pour les clés, commentaires et volumes.',
  mysql: 'MySQL et MariaDB.',
  sqlserver: 'Microsoft SQL Server et Azure SQL.',
  oracle: 'Oracle Database, par nom de service.',
  snowflake: 'Entrepôt Snowflake : relations à déclarer à la main.',
  mongodb: 'Collections lues comme des tables ; relations à déclarer.',
  trino: 'N’importe quel connecteur Trino : Iceberg, Hive, ClickHouse…',
}

/** « Ajouter une source » : the engine first, then its connection form. */
export function NewSourceDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (ds: Datasource) => void }) {
  const { data: engines, isLoading } = useEngines()
  const [engine, setEngine] = useState<Engine | null>(null)
  const qc = useQueryClient()
  useEffect(() => {
    if (open) setEngine(null)
  }, [open])
  const spec = engines?.find((e) => e.engine === engine)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={cn(!spec && 'text-primary')}>{$t('1. Moteur')}</span>
            <ChevronRight className="size-3" />
            <span className={cn(spec && 'text-primary')}>{$t('2. Connexion')}</span>
          </div>
          <DialogTitle className="flex items-center gap-3 text-lg">
            {spec ? <EngineBadge engine={spec.engine} size="sm" /> : null}
            {spec ? $t('Connecter {engine}', { engine: spec.label }) : $t('Ajouter une source de données')}
          </DialogTitle>
          <DialogDescription>
            {spec
              ? $t('La connexion est testée avec le pilote natif, puis le catalogue est créé dans Trino et la structure synchronisée.')
              : $t('Choisissez le moteur de la base à connecter. Toutes les requêtes passeront par Trino.')}
          </DialogDescription>
        </DialogHeader>

        {spec ? (
          <SourceForm
            key={spec.engine}
            spec={spec}
            onBack={() => setEngine(null)}
            onCancel={() => onOpenChange(false)}
            onSaved={async (ds) => {
              toast.success($t('Source « {name} » ajoutée : synchronisation lancée.', { name: ds.name }))
              await qc.invalidateQueries({ queryKey: keys.datasources })
              await qc.invalidateQueries({ queryKey: keys.tree })
              onOpenChange(false)
              onCreated(ds)
            }}
          />
        ) : isLoading ? (
          <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {(engines ?? []).map((e) => (
              <button
                key={e.engine}
                type="button"
                onClick={() => setEngine(e.engine)}
                className="group flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <EngineBadge engine={e.engine} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-semibold">
                    {e.label}
                    <ChevronRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="text-xs text-muted-foreground">{ENGINE_HINTS[e.engine] ? $t(ENGINE_HINTS[e.engine] as string) : null}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
