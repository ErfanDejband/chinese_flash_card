/** Text-to-speech through the Web Speech API (free, offline on most Android phones). */

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Mandarin voices; Cantonese (zh-HK / yue) is excluded. */
export function mandarinVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return []
  return speechSynthesis
    .getVoices()
    .filter((v) => /^(zh|cmn)([-_]|$)/i.test(v.lang) && !/HK|yue/i.test(v.lang))
}

/** Preferred voice, else Taiwanese Mandarin, else Mainland, else any Mandarin voice. */
export function pickVoice(preferredURI?: string): SpeechSynthesisVoice | undefined {
  const voices = mandarinVoices()
  return (
    voices.find((v) => v.voiceURI === preferredURI) ??
    voices.find((v) => /TW|Hant/i.test(v.lang)) ??
    voices.find((v) => /CN|Hans/i.test(v.lang)) ??
    voices[0]
  )
}

export function speak(text: string, preferredURI?: string): boolean {
  if (!speechSupported() || !text.trim()) return false
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(preferredURI)
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? 'zh-TW'
  utterance.rate = 0.85
  speechSynthesis.speak(utterance)
  return true
}
