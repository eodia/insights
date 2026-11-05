'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { intlLocale } from './i18n'

/**
 * Speaking to the assistant and the copilot, and hearing them answer.
 *
 * Dictation is the browser's own speech recognition — Chrome and Edge send the sound to their
 * maker's service to be written down; Firefox has none, and the microphone is then not offered.
 * The answer is read aloud by the browser's voices, on the device.
 */

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionCtor = new () => Recognition

const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** The language spoken and read: the interface's. */
const speechLang = () => ({ fr: 'fr-FR', en: 'en-US', es: 'es-ES' })[intlLocale().slice(0, 2)] ?? intlLocale()

/** A question asked aloud: its answer is read aloud when it comes. */
let replyAloud = false

/**
 * Dictation: what is said is written as it comes (`onText`), then given once the person stops
 * speaking (`onFinal`) — to be sent at once.
 */
export function useDictation({ onText, onFinal, onError }: { onText: (text: string) => void; onFinal: (text: string) => void; onError?: (reason: string) => void }) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  const handlers = useRef({ onText, onFinal, onError })
  handlers.current = { onText, onFinal, onError }
  useEffect(() => setSupported(recognitionCtor() !== null), [])
  useEffect(() => () => rec.current?.abort(), [])

  const stop = useCallback(() => rec.current?.stop(), [])
  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor || rec.current) return
    stopSpeaking()
    const r = new Ctor()
    r.lang = speechLang()
    r.interimResults = true
    r.continuous = false
    let finalText = ''
    r.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        const text = result?.[0]?.transcript ?? ''
        if (result?.isFinal) finalText += text
        else interim += text
      }
      handlers.current.onText((finalText + interim).trim())
    }
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') handlers.current.onError?.(e.error)
    }
    r.onend = () => {
      rec.current = null
      setListening(false)
      const said = finalText.trim()
      if (said) {
        replyAloud = true
        handlers.current.onFinal(said)
      }
    }
    rec.current = r
    setListening(true)
    r.start()
  }, [])
  return { supported, listening, start, stop }
}

/** An answer as one says it: without its code, its tables, its links' addresses, its marks. */
function spoken(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Reads an answer aloud — only one asked aloud, once; a new dictation cuts it short. */
export function speakReply(markdown: string): void {
  if (!replyAloud) return
  replyAloud = false
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const text = spoken(markdown).slice(0, 2000)
  if (!text) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = speechLang()
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()))
  if (voice) u.voice = voice
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}
