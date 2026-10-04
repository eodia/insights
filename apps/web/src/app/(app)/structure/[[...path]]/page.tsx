import { redirect } from 'next/navigation'

/** The structure now lives in each data source: old links lead there. */
export default async function StructurePage({ params, searchParams }: { params: Promise<{ path?: string[] }>; searchParams: Promise<{ tab?: string }> }) {
  const { path = [] } = await params
  const { tab } = await searchParams
  redirect(`/data${path.length ? `/${path.map(encodeURIComponent).join('/')}` : ''}${tab === 'relations' ? '?tab=relations' : ''}`)
}
