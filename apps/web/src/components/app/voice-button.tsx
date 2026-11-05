'use client'

import { Hint } from '@/components/ui/tooltip'
import { $t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useDictation } from '@/lib/voice'
import { Mic, Square } from 'lucide-react'
import { toast } from 'sonner'

/**
 * The microphone of a question field: what is said is written as it comes, then sent once one
 * stops speaking — and its answer read aloud. Not offered where the browser cannot listen.
 */
export function VoiceButton({ onText, onSend, disabled, className }: { onText: (text: string) => void; onSend: (text: string) => void; disabled?: boolean; className?: string }) {
  const { supported, listening, start, stop } = useDictation({
    onText,
    onFinal: onSend,
    onError: (reason) =>
      toast.error(reason === 'not-allowed' || reason === 'service-not-allowed' ? $t('Le micro n’est pas autorisé pour ce site.') : $t('La dictée s’est interrompue ({reason}).', { reason })),
  })
  if (!supported) return null
  return (
    <Hint label={listening ? $t('Arrêter la dictée') : $t('Parler (la réponse est lue à voix haute)')}>
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled}
        aria-label={listening ? $t('Arrêter la dictée') : $t('Parler')}
        aria-pressed={listening}
        className={cn(
          'relative inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
          listening ? 'bg-red-500 text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          className,
        )}
      >
        {listening ? <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" /> : null}
        {listening ? <Square className="relative size-3.5 fill-current" /> : <Mic className="size-4.5" />}
      </button>
    </Hint>
  )
}
