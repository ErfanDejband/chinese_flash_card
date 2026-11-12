import { createPublicRead } from '@/classes/drive'
import { appRootUrl } from './appUrl'

/**
 * The app's public Google API key (project "Mandarin Leitner"). Like the OAuth client id it is
 * public by design: it only lets students' browsers read class files that a teacher shared by
 * link, and Google accepts it only from the app's own addresses, for the Drive API.
 */
export const GOOGLE_API_KEY = 'AIzaSyATcgP5fG6-mjiZSkoljIXRAAeRXD1Vvto'

/** Reads shared class files, no sign-in. */
export const publicRead = createPublicRead(GOOGLE_API_KEY)

/** The link students open: a hash route, so the class id never reaches the web server's logs. */
export const classLink = (manifestId: string) => `${appRootUrl()}#/join/${manifestId}`

/** The class id in a pasted link (`…#/join/<id>`), or a bare id. */
export function classIdFrom(text: string): string | undefined {
  const t = text.trim()
  const fromLink = /#\/join\/([\w-]{10,})/.exec(t)?.[1]
  if (fromLink) return fromLink
  return /^[\w-]{20,}$/.test(t) ? t : undefined
}
