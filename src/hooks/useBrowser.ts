import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAiSettings, subscribeAiSettings, type AiSettingsState } from '@/lib/aiConfig'
import { canInstall, subscribeInstall } from '@/lib/install'
import { mandarinVoices, speechSupported } from '@/lib/speech'

/** AI provider settings of this device. */
export function useAiSettings(): AiSettingsState {
  return useSyncExternalStore(subscribeAiSettings, getAiSettings)
}

/**
 * Object URL for a Blob, identified by `key` (live queries return a new Blob object on every
 * change, so object identity cannot be the key). Revoked when the key changes or on unmount.
 */
export function useBlobUrl(blob: Blob | undefined, key: string | undefined): string | undefined {
  const [entry, setEntry] = useState<{ key: string; url: string }>()
  useEffect(() => {
    if (!blob || key === undefined) return
    const url = URL.createObjectURL(blob)
    // Deferred so the effect body doesn't set state synchronously.
    const t = setTimeout(() => setEntry({ key, url }))
    return () => {
      clearTimeout(t)
      URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifies the content; a new Blob object with the same key must not recreate the URL
  }, [key])
  return entry && entry.key === key ? entry.url : undefined
}

/** True while Chrome offers to install the app. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribeInstall, canInstall, () => false)
}

/** Mandarin speech-synthesis voices (Chrome loads them asynchronously). */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(mandarinVoices)
  useEffect(() => {
    if (!speechSupported()) return
    const update = () => setVoices(mandarinVoices())
    speechSynthesis.addEventListener('voiceschanged', update)
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}
