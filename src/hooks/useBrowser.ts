import { useEffect, useState, useSyncExternalStore } from 'react'
import { canInstall, subscribeInstall } from '@/lib/install'
import { mandarinVoices, speechSupported } from '@/lib/speech'

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
