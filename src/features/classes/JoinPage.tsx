import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { readClassFile } from '@/classes/classFile'
import type { PublicRead } from '@/classes/drive'
import { ClassError } from '@/classes/format'
import { openClass, takeLessons, unlockClass, type OpenedClass } from '@/classes/join'
import { db } from '@/data/db'
import { createClassStore } from '@/data/repositories/classStore'
import { classIdFrom, publicRead } from '@/lib/classConfig'
import { dismissNews } from '@/lib/classRunner'
import { requestSync } from '@/lib/syncRunner'
import { Button, ButtonLink } from '@/ui/Button'
import { plural } from '@/ui/format'
import { Icon } from '@/ui/icons'
import { Loading } from '@/ui/Loading'
import { PageHeader } from '@/ui/PageHeader'
import { ProgressBar } from '@/ui/ProgressBar'
import { takeClassFile } from './classFileHandoff'

const inputClass = 'h-12 w-full rounded-xl border border-line bg-surface px-3 outline-none focus:border-accent'

/** Chrome on Android reads QR codes from a photo; elsewhere the phone's camera app opens the link. */
interface BarcodeDetectorLike {
  detect(image: ImageBitmapSource): Promise<{ rawValue: string }[]>
}
const detectorClass = () => (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector

type Loaded = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; opened: OpenedClass; read: PublicRead; fromFile?: string }

const errorText = (e: unknown) => (e instanceof ClassError || e instanceof Error ? e.message : 'Could not open the class.')

/** `/join`: paste a link, scan a QR code or open a class file. */
function JoinStart({ onFile }: { onFile(file: File): void }) {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  const fileInput = useRef<HTMLInputElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const Detector = detectorClass()

  function open(e: FormEvent) {
    e.preventDefault()
    const id = classIdFrom(text)
    if (id) navigate(`/join/${id}`)
    else setError('That doesn’t look like a class link. It ends in #/join/ and a long code.')
  }

  async function scan(file: File | undefined) {
    if (!file || !Detector) return
    setError(undefined)
    try {
      const codes = await new Detector({ formats: ['qr_code'] }).detect(await createImageBitmap(file))
      const id = codes.map((c) => classIdFrom(c.rawValue)).find(Boolean)
      if (id) navigate(`/join/${id}`)
      else setError(codes.length ? 'That QR code isn’t a class link.' : 'No QR code found in the photo. Try again closer, with the whole code in view.')
    } catch {
      setError('Couldn’t read the photo.')
    }
  }

  return (
    <>
      <PageHeader title="Join a class" back="/decks" />
      <section className="rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm text-muted">
          The easiest way: open the link your teacher sent, or scan their QR code with your phone’s camera. The class opens here, and you pick the lessons you want.
          No account needed.
        </p>
        <form onSubmit={open} className="mt-4 flex flex-col gap-2">
          <label htmlFor="class-link" className="text-sm font-semibold">
            Paste the class link
          </label>
          <input id="class-link" value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…#/join/…" autoComplete="off" className={inputClass} />
          <Button type="submit" disabled={!text.trim()}>
            Open the class
          </Button>
        </form>
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          {Detector && (
            <Button variant="secondary" onClick={() => photoInput.current?.click()}>
              <Icon name="camera" /> Scan a QR code
            </Button>
          )}
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" /> Open a class file
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <input ref={photoInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void scan(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onFile(file)
          }}
        />
      </section>
    </>
  )
}

/**
 * `/join/:classId` (a shared class) or a class file: the class, its lessons to pick (already taken
 * ones ticked), the password when it has one, then the cards.
 */
export function JoinPage() {
  const { classId } = useParams()
  const [file, setFile] = useState<File | undefined>(takeClassFile)
  const [loaded, setLoaded] = useState<Loaded>()
  const [password, setPassword] = useState('')
  const [picked, setPicked] = useState<Set<string>>()
  const [progress, setProgress] = useState<{ done: number; total: number }>()
  const [added, setAdded] = useState<{ cards: number; deckId: string }>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!classId && !file) return
    let active = true
    const load = file
      ? file.arrayBuffer().then((b) => ({ ...readClassFile(new Uint8Array(b)), fromFile: file.name }))
      : openClass(publicRead, classId!).then((opened) => ({ opened, read: publicRead }))
    load.then(
      (r) => active && setLoaded({ status: 'ready', ...r }),
      (e: unknown) => active && setLoaded({ status: 'error', message: errorText(e) }),
    )
    return () => {
      active = false
    }
  }, [classId, file])

  const ready = loaded?.status === 'ready' ? loaded : undefined
  const classDeckId = ready?.opened.manifest.id
  const local = useLiveQuery(async () => (classDeckId ? ((await db.decks.get(classDeckId)) ?? null) : null), [classDeckId])

  if (!classId && !file) return <JoinStart onFile={setFile} />
  if (!loaded || loaded.status === 'loading' || (ready && local === undefined)) return <Loading label="Opening the class…" />
  if (loaded.status === 'error') {
    return (
      <>
        <PageHeader title="Join a class" back="/join" />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <p className="font-semibold">Couldn’t open the class</p>
          <p className="mt-1 text-sm text-muted">{loaded.message}</p>
          <ButtonLink to="/join" variant="secondary" className="mt-4">
            Try another link or file
          </ButtonLink>
        </section>
      </>
    )
  }

  const { opened, read } = loaded
  const { manifest, body } = opened
  const own = local && !local.remote && local.deletedAt === undefined
  const taken = new Set(Object.keys(local && local.deletedAt === undefined ? (local.remote?.lessons ?? {}) : {}))

  if (own) {
    return (
      <>
        <PageHeader title={manifest.title} back="/decks" />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <p className="font-semibold">This is your own class.</p>
          <p className="mt-1 text-sm text-muted">It’s already in your decks; students who open this link get it.</p>
          <ButtonLink to={`/decks/${manifest.id}`} className="mt-4">
            Open the deck
          </ButtonLink>
        </section>
      </>
    )
  }

  if (added) {
    return (
      <>
        <PageHeader title={manifest.title} back="/decks" />
        <section className="rounded-3xl border border-line bg-surface p-5">
          <p className="text-lg font-semibold">Added {plural(added.cards, 'card')}.</p>
          <p className="mt-1 text-muted">
            {opened.manifestId ? 'When your teacher adds lessons or fixes cards, they reach you here.' : 'They’re in a deck of their own.'} New cards wait in the new-card
            pool; a few are introduced each day.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink to={`/review?deck=${added.deckId}`} state={{ from: `/decks/${added.deckId}` }}>
              Start reviewing
            </ButtonLink>
            <ButtonLink to={`/decks/${added.deckId}`} variant="secondary">
              Open the class
            </ButtonLink>
          </div>
        </section>
      </>
    )
  }

  async function unlock(e: FormEvent) {
    e.preventDefault()
    setError(undefined)
    try {
      setLoaded({ status: 'ready', opened: await unlockClass(opened, password), read })
    } catch (err) {
      setError(errorText(err))
    }
  }

  if (!body) {
    return (
      <>
        <PageHeader title={manifest.title} subtitle={manifest.teacher ? `A class by ${manifest.teacher}` : 'A shared class'} back="/decks" />
        <form onSubmit={unlock} className="rounded-3xl border border-line bg-surface p-5">
          <p className="font-semibold">🔒 This class has a password</p>
          <p className="mt-1 text-sm text-muted">Your teacher tells it in class. You type it once.</p>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Class password" autoComplete="off" autoFocus className={`${inputClass} mt-3`} />
          <Button type="submit" className="mt-3 w-full" disabled={!password}>
            Open
          </Button>
          {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      </>
    )
  }

  const choosable = body.lessons.filter((l) => !taken.has(l.id))
  const chosen = picked ?? new Set(choosable.map((l) => l.id))
  const count = body.lessons.filter((l) => chosen.has(l.id) && !taken.has(l.id)).reduce((n, l) => n + l.cards, 0)
  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  async function add() {
    setError(undefined)
    setProgress({ done: 0, total: 1 })
    try {
      const plan = await takeLessons(read, createClassStore(), opened, [...chosen].filter((id) => !taken.has(id)), { onProgress: setProgress })
      await dismissNews(manifest.id, body!.lessons.map((l) => l.id))
      requestSync('review')
      setAdded({ cards: plan.added.length, deckId: manifest.id })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setProgress(undefined)
    }
  }

  return (
    <>
      <PageHeader
        title={manifest.title}
        subtitle={[manifest.teacher && `A class by ${manifest.teacher}`, loaded.fromFile && `from ${loaded.fromFile}`].filter(Boolean).join(' · ') || 'A shared class'}
        back="/decks"
      />
      {body.description && <p className="mb-4 text-muted">{body.description}</p>}
      <section className="rounded-3xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Lessons</h2>
          {choosable.length > 1 && (
            <button type="button" className="text-sm font-semibold text-accent" onClick={() => setPicked(chosen.size >= choosable.length ? new Set() : new Set(choosable.map((l) => l.id)))}>
              {chosen.size >= choosable.length ? 'None' : 'All'}
            </button>
          )}
        </div>
        <ul className="divide-y divide-line">
          {body.lessons.map((l) => (
            <li key={l.id}>
              <label className="flex items-center gap-3 py-3">
                <input type="checkbox" className="size-5" checked={taken.has(l.id) || chosen.has(l.id)} disabled={taken.has(l.id)} onChange={() => toggle(l.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{l.title}</span>
                  <span className="block text-sm text-muted">
                    {plural(l.cards, 'card')}
                    {taken.has(l.id) && ' · added'}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>
      {progress ? (
        <div className="mt-4">
          <ProgressBar
            segments={Array.from({ length: Math.max(1, Math.ceil(progress.total)) }, (_, i) => (i < Math.floor(progress.done) ? 'done' : i === Math.floor(progress.done) ? 'current' : 'pending'))}
            label="Adding the lessons"
          />
          <p className="mt-1.5 text-sm text-muted">Getting the lessons and their pictures…</p>
        </div>
      ) : (
        <Button size="lg" className="mt-4 w-full" disabled={count === 0} onClick={() => void add()}>
          {count ? `Add ${plural(count, 'card')}` : taken.size ? 'All lessons added' : 'Pick a lesson'}
        </Button>
      )}
      {taken.size > 0 && (
        <p className="mt-3 text-center text-sm">
          <Link to={`/decks/${manifest.id}`} className="font-semibold text-accent">
            Open the class →
          </Link>
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loaded.fromFile && <p className="mt-3 text-xs text-muted">A class file brings no updates; opening a newer file of the same class updates it.</p>}
    </>
  )
}
