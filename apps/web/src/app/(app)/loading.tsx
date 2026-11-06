/**
 * What shows at once in the page's place while the next one comes: its outline, quietly
 * pulsing — the sidebar and the top bar stay as they are.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse p-6" aria-busy="true">
      <div className="h-7 w-64 rounded-md bg-muted" />
      <div className="mt-3 h-4 w-96 max-w-full rounded-md bg-muted/70" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed outline
          <div key={i} className="h-40 rounded-xl bg-muted/60" />
        ))}
      </div>
    </div>
  )
}
