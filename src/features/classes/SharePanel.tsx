import { useEffect, useEffectEvent, useState } from 'react'
import { useSearchParams } from 'react-router'
import { exportClassFile } from '@/classes/classFile'
import { deriveKey, PBKDF2_ITERATIONS, randomSalt } from '@/classes/crypto'
import { ClassError } from '@/classes/format'
import { unpublishedChanges } from '@/classes/publish'
import { publishSource, setTeacherName } from '@/data/repositories/classStore'
import type { Card, ClassLock, Deck, Lesson } from '@/domain/types'
import { classLink } from '@/lib/classConfig'
import { shareDeck, takePendingShare, unshareDeck } from '@/lib/classShare'
import { downloadFile } from '@/lib/storage'
import { Button } from '@/ui/Button'
import { plural, timeAgo } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { ProgressBar } from '@/ui/ProgressBar'
import { QrCode } from './QrCode'

const inputClass = 'h-11 w-full rounded-xl border border-line bg-paper px-3 outline-none focus:border-accent'

const message = (e: unknown) => (e instanceof ClassError || e instanceof Error ? e.message : 'Something went wrong.')

async function makeLock(password: string): Promise<ClassLock> {
  const salt = randomSalt()
  return { salt, iterations: PBKDF2_ITERATIONS, key: await deriveKey(password, salt) }
}

/** Copy the link, or hand it to the phone's share sheet. */
function LinkRow({ link, title }: { link: string; title: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(t)
  }, [copied])
  async function share() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: `Join my class “${title}” in Mandarin Leitner`, url: link })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    await copy()
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      // The link is selectable below.
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Class link" className={`${inputClass} font-mono text-xs`} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void share()}>
          <Icon name="share" className="size-4" /> Share link
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void copy()}>
          {copied ? 'Copied ✓' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}

/** The QR code, full screen, for a projector or a printout. */
function QrScreen({ link, title, onClose }: { link: string; title: string; onClose(): void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-6 text-black" role="dialog" aria-label="Class QR code">
      <p className="text-center text-2xl font-bold">{title}</p>
      <QrCode text={link} className="aspect-square w-full max-w-[min(80vh,32rem)]" />
      <p className="text-center text-sm">Scan with the phone’s camera to join the class in Mandarin Leitner.</p>
      <Button variant="secondary" onClick={onClose} className="!bg-white !text-black">
        Close
      </Button>
    </div>
  )
}

/**
 * Share a deck as a class (teacher side): the first share, then the link and QR code, publishing
 * changes, the password, and stopping. Also saves the deck as a class file.
 */
export function SharePanel({ deck, lessons, cards }: { deck: Deck; lessons: Lesson[]; cards: Card[] }) {
  const [params, setParams] = useSearchParams()
  const share = deck.share
  const [teacher, setTeacher] = useState(deck.teacher ?? '')
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<{ done: number; total: number; label: string }>()
  const [error, setError] = useState<string>()
  const [qr, setQr] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const changes = unpublishedChanges(deck, lessons, cards)
  const link = share ? classLink(share.manifestId) : ''

  async function run(label: string, work: (onProgress: (done: number, total: number) => void) => Promise<unknown>) {
    setError(undefined)
    setBusy({ done: 0, total: 1, label })
    try {
      await work((done, total) => setBusy({ done, total, label }))
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(undefined)
    }
  }

  const publish = (lock?: ClassLock | null) =>
    run(share ? 'Publishing changes…' : 'Sharing the class…', async (onProgress) => {
      if ((await shareDeck(deck.id, { lock, onProgress })) === 'signing-in') return
      setPassword('')
      setUsePassword(false)
      setChangingPassword(false)
    })

  // Back from Google's sign-in: finish what was asked.
  const resume = useEffectEvent(() => {
    const asked = params.has('share') ? 'share' : params.has('unshare') ? 'unshare' : undefined
    if (!asked) return
    setParams({}, { replace: true })
    const pending = takePendingShare(deck.id)
    if (asked === 'share') void publish(pending?.lock)
    else void run('Stopping…', () => unshareDeck(deck.id))
  })
  useEffect(() => {
    // Deferred so the effect body doesn't set state synchronously (and StrictMode's second run doesn't repeat it).
    const t = setTimeout(resume)
    return () => clearTimeout(t)
  }, [])

  async function startSharing() {
    if (usePassword && password.length < 4) return setError('Choose a password of at least 4 characters.')
    await setTeacherName(deck.id, teacher)
    await publish(usePassword ? await makeLock(password) : undefined)
  }

  async function saveFile() {
    const src = await publishSource(deck.id)
    if (!src) return
    const bytes = await exportClassFile(src)
    downloadFile(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `${deck.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'class'} (class).zip`)
  }

  const progress = busy && (
    <div className="mt-3">
      <p className="mb-1.5 text-sm text-muted" aria-live="polite">
        {busy.label} {busy.total > 1 && `${busy.done} of ${busy.total}`}
      </p>
      <ProgressBar
        segments={Array.from({ length: Math.max(1, busy.total) }, (_, i) => (i < busy.done ? 'done' : i === busy.done ? 'current' : 'pending'))}
        label={busy.label}
        valueText={`${busy.done} of ${busy.total}`}
      />
    </div>
  )

  return (
    <section className="mt-8 rounded-3xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="share" className="size-5 text-accent" /> {share ? 'Shared as a class' : 'Share as a class'}
      </h2>

      {!share ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Students open a link or scan a QR code, pick lessons and get the cards. They need no account. The class is kept in your Google Drive, in a
            folder named “Mandarin Leitner · {deck.title}”, and the app can only see the files it makes there.
          </p>
          <label className="mt-3 flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Your name, as students see it</span>
            <input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="e.g. 林老師 or Ms Lin" className={inputClass} />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} className="size-4" />
            <span className="font-medium">Ask for a password</span>
          </label>
          {usePassword && (
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Class password" aria-label="Class password" autoComplete="off" className={`${inputClass} mt-2`} />
          )}
          {usePassword && <p className="mt-1 text-xs text-muted">Without it, the link only shows the class name. Tell it in class; students type it once.</p>}
          <Button className="mt-4 w-full" onClick={() => void startSharing()} disabled={!!busy}>
            Share as a class
          </Button>
          <p className="mt-2 text-xs text-muted">The first time, Google asks you to let the app keep files in your Drive.</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Published {timeAgo(share.publishedAt)}
            {share.lock ? ' · 🔒 password' : ''}
            {deck.teacher ? ` · by ${deck.teacher}` : ''}
          </p>
          <div className="mt-3">
            <LinkRow link={link} title={deck.title} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setQr(true)} className="rounded-xl border border-line bg-white p-1.5" aria-label="Show the QR code full screen">
              <QrCode text={link} className="size-24" />
            </button>
            <p className="min-w-0 flex-1 text-sm text-muted">Tap the code to show it full screen, for a projector or a printout.</p>
          </div>

          <div className="mt-4 rounded-2xl bg-sunken p-3 text-sm">
            {changes > 0 ? (
              <>
                <p>
                  <span className="font-semibold">{changes === 1 ? '1 change' : `${changes} changes`}</span> not published yet. Students get them after you publish.
                </p>
                <Button size="sm" className="mt-2" onClick={() => void publish()} disabled={!!busy}>
                  Publish changes
                </Button>
              </>
            ) : (
              <p>✓ Students have the latest version.</p>
            )}
          </div>

          {changingPassword ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" aria-label="New class password" autoComplete="off" className={`${inputClass} flex-1 basis-40`} />
              <Button size="sm" disabled={password.length < 4 || !!busy} onClick={() => void (async () => publish(await makeLock(password)))()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setChangingPassword(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <button type="button" className="font-semibold text-accent" onClick={() => setChangingPassword(true)}>
                {share.lock ? 'Change the password' : 'Add a password'}
              </button>
              {share.lock && (
                <button type="button" className="font-semibold text-accent" onClick={() => void publish(null)}>
                  Remove the password
                </button>
              )}
            </div>
          )}
          {share.lock && <p className="mt-1 text-xs text-muted">Students who joined keep their access after a change; new students need the new password.</p>}

          {confirmStop ? (
            <div className="mt-4 rounded-2xl border border-red-200 p-3 text-sm dark:border-red-900">
              <p className="font-semibold">Stop sharing “{deck.title}”?</p>
              <p className="mt-1 text-muted">The class files leave your Drive and the link stops working. Students keep the cards they have, but get no more updates.</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="danger" disabled={!!busy} onClick={() => void run('Stopping…', () => unshareDeck(deck.id)).then(() => setConfirmStop(false))}>
                  Stop sharing
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmStop(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" className="mt-4 text-sm font-medium text-muted hover:text-ink" onClick={() => setConfirmStop(true)}>
              Stop sharing…
            </button>
          )}
        </>
      )}

      {progress}
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 border-t border-line pt-3 text-sm">
        <button type="button" className="font-semibold text-accent" onClick={() => void saveFile()}>
          Save as a class file
        </button>
        <span className="text-muted"> · to send by LINE, e-mail or Google Classroom; it opens in the app without Google. {plural(lessons.filter((l) => !l.hidden).length, 'lesson')}.</span>
      </div>

      {qr && share && <QrScreen link={link} title={deck.title} onClose={() => setQr(false)} />}
    </section>
  )
}
