'use client'

import type { Dashboard, ExportOptions, ParameterValue } from '@eodia/contracts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { $t } from '@/lib/i18n'
import { FileDown } from 'lucide-react'
import { useState } from 'react'
import { ExportOptionsForm } from './editors'

const KEY = 'eodia:export-options:'

/** The choices last made for this dashboard, kept in this browser. */
function remembered(id: string): ExportOptions {
  try {
    return JSON.parse(localStorage.getItem(KEY + id) ?? '{}') as ExportOptions
  } catch {
    return {}
  }
}

/** « Exporter en PDF… » : the dashboard put on paper as one chooses, opened in the print page. */
export function ExportDialog({ dashboard, values, onClose }: { dashboard: Dashboard; values: Readonly<Record<string, ParameterValue | null>>; onClose: () => void }) {
  const [options, setOptions] = useState<ExportOptions>(() => {
    const kept = remembered(dashboard.id)
    // A tab removed since is forgotten.
    return kept.tabs ? { ...kept, tabs: kept.tabs.filter((t) => dashboard.tabs.some((x) => x.id === t)) } : kept
  })
  const open = () => {
    try {
      localStorage.setItem(KEY + dashboard.id, JSON.stringify(options))
    } catch {}
    const params = new URLSearchParams({ values: JSON.stringify(values), options: JSON.stringify(options) })
    window.open(`/print/dashboard/${dashboard.id}?${params}`, '_blank')
    onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{$t('Exporter en PDF')}</DialogTitle>
          <DialogDescription>{$t('Les onglets, le papier et la page de garde ; les filtres choisis à l’écran s’appliquent.')}</DialogDescription>
        </DialogHeader>
        <ExportOptionsForm tabs={dashboard.tabs} value={options} onChange={setOptions} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {$t('Annuler')}
          </Button>
          <Button onClick={open}>
            <FileDown /> {$t('Ouvrir l’aperçu')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
