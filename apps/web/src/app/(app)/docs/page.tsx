'use client'

import { DocsViewer } from '@/components/app/docs/docs-viewer'
import { $t } from '@/lib/i18n'
import { useCrumbs } from '@/lib/store'

export default function DocsPage() {
  useCrumbs([{ label: $t('API et MCP') }])
  return <DocsViewer />
}
