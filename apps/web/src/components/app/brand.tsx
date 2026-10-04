import { cn } from '@/lib/utils'
import { BrandMark } from './brand-mark'

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark className="size-9 shrink-0" />
      <span className="text-lg font-semibold tracking-tight">eodia insights</span>
    </div>
  )
}
