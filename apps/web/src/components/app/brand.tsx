import { cn } from '@/lib/utils'

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M5 18v-5M10 18V7M15 18v-8M20 18v-3" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight">eodia insights</span>
    </div>
  )
}
