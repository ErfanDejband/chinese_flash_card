import { createCards, listActiveCards, type NewCard } from '@/data/repositories/cards'
import { knownHanziSet } from '@/data/repositories/knownWords'
import type { NewMedia } from '@/data/repositories/media'
import { configProblems, createProvider } from '@/import/ai/createProvider'
import { bytesToBase64 } from '@/import/ai/http'
import { parseModelJson } from '@/import/ai/parse'
import { cropFromImage } from '@/import/pdf/crop'
import { canvasToBlob } from '@/import/render'
import { activeProviderConfig, getAiSettings } from '@/lib/aiConfig'
import { recordUsage } from '@/lib/aiUsage'
import { getSnapPrefs, setSnapPrefs } from '@/lib/snapPrefs'
import { plannedCards, preselectAll, type SnapContext } from '@/vision/cards'
import { padBox, type Detection } from '@/vision/detections'
import { loadDetector, webGpuInfo, type Detector } from '@/vision/detector'
import { drawMosaic, mosaicLayout } from '@/vision/mosaic'
import { nameInput, OBJECT_NAME_TASK, validateNames, type LearnerLevel, type ObjectWords } from '@/vision/tasks'
import { readPhoto, type Chosen, type Photo } from './photo'

/**
 * One Snap from photo to cards. Kept outside React (like the import runner) so switching tabs
 * keeps the photo, the chosen objects and the AI's words; "New photo" starts over.
 */
export interface SnapState {
  step: 'start' | 'pick' | 'words' | 'done'
  photo?: Photo
  photoError?: string
  /** Every candidate of the detector, best first. */
  detections: Detection[]
  detecting: boolean
  /** The first load of the model (a download the first time), while it runs. */
  loading?: { loaded: number; total: number }
  modelError?: string
  chosen: Chosen[]
  naming: boolean
  names?: Map<number, ObjectWords>
  /** Kept words per picture number. */
  picks: Record<number, number[]>
  /** Words already in the deck or known, when the words came. */
  context: SnapContext
  aiError?: string
  adding: boolean
  added?: number
}

const fresh = (): SnapState => ({
  step: 'start',
  detections: [],
  detecting: false,
  chosen: [],
  naming: false,
  picks: {},
  context: { inDeck: new Set(), known: new Set() },
  adding: false,
})

let state = fresh()
const listeners = new Set<() => void>()

function set(patch: Partial<SnapState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export const snapStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// The model stays loaded while the app is open: a second photo needs no load at all.
let detector: Detector | undefined
let loadingDetector: Promise<Detector> | undefined

/**
 * WebGPU fp32 where the browser has WebGPU (about 0.25 s a photo), else WASM int8 (about 1 s); both
 * come from the app's own address. fp16 is never used: it found nothing on an Adreno phone.
 */
async function getDetector(wasmOnly = false): Promise<Detector> {
  if (detector && (!wasmOnly || detector.backend === 'wasm')) return detector
  loadingDetector ??= (async () => {
    const onProgress = (loaded: number, total: number) => set({ loading: { loaded, total } })
    set({ loading: { loaded: 0, total: 0 }, modelError: undefined })
    try {
      if (!wasmOnly && (await webGpuInfo()).available) {
        try {
          return (await loadDetector('webgpu', 'fp32', { source: 'app', onProgress })).detector
        } catch {
          // Some GPUs refuse the model: the processor always works.
        }
      }
      return (await loadDetector('wasm', 'q8', { source: 'app', onProgress })).detector
    } finally {
      set({ loading: undefined })
    }
  })()
  try {
    const loaded = await loadingDetector
    if (detector && detector !== loaded) await detector.dispose()
    detector = loaded
    return loaded
  } finally {
    loadingDetector = undefined
  }
}

async function detect(photo: Photo) {
  set({ detecting: true, modelError: undefined })
  try {
    let d = await getDetector()
    let result
    try {
      result = await d.detect(photo.canvas)
    } catch (e) {
      if (d.backend !== 'webgpu') throw e
      d = await getDetector(true)
      result = await d.detect(photo.canvas)
    }
    if (state.photo === photo) set({ detections: result.detections })
  } catch (e) {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    set({ modelError: offline ? 'Finding objects needs a one-time download. Connect to the internet and try again.' : `Finding objects didn’t work: ${message(e)}` })
  } finally {
    set({ detecting: false })
  }
}

export async function snapPhoto(file: File | undefined) {
  if (!file) return
  let photo: Photo
  try {
    photo = await readPhoto(file)
  } catch {
    set({ photoError: 'This photo could not be read (HEIC photos need a browser that can open them).' })
    return
  }
  if (state.photo) URL.revokeObjectURL(state.photo.url)
  set({ ...fresh(), step: 'pick', photo })
  await detect(photo)
}

/** Look for objects again (after an error). */
export function retryDetect() {
  if (state.photo) void detect(state.photo)
}

export function setChosen(chosen: Chosen[]) {
  set({ chosen })
}

/** Ask the AI for the chosen objects' words: one mosaic picture, one request. */
export async function nameChosen() {
  const { photo, chosen } = state
  if (!photo || !chosen.length || state.naming) return
  const config = activeProviderConfig(getAiSettings())
  if (configProblems(config).length) return set({ aiError: 'Set up AI first in Settings → AI & pictures (the free option needs no key).' })
  set({ naming: true, aiError: undefined })
  try {
    const mosaic = drawMosaic(photo.canvas, chosen.map((c) => c.box))
    const blob = await canvasToBlob(mosaic, 'image/jpeg', 0.9)
    const res = await createProvider(config).extractPage({
      imageBase64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
      mime: 'image/jpeg',
      textHint: nameInput(mosaicLayout(chosen.length), chosen.map((c) => c.label)),
      task: OBJECT_NAME_TASK,
    })
    recordUsage(config.provider, res.model || config.model, res.usage)
    const names = validateNames(parseModelJson(res.text), chosen.length)
    const context = { inDeck: new Set((await listActiveCards()).map((c) => c.hanzi)), known: await knownHanziSet() }
    if (state.photo !== photo) return
    set({ names, context, picks: preselectAll(names, getSnapPrefs().learner, context), step: 'words' })
  } catch (e) {
    set({ aiError: message(e) })
  } finally {
    set({ naming: false })
  }
}

export function togglePick(index: number, word: number) {
  const current = state.picks[index] ?? []
  set({ picks: { ...state.picks, [index]: current.includes(word) ? current.filter((w) => w !== word) : [...current, word].sort() } })
}

/** A new level preselects again. */
export function setLearner(learner: LearnerLevel) {
  setSnapPrefs({ learner })
  if (state.names) set({ picks: preselectAll(state.names, learner, state.context) })
}

/** Back from the words to the photo; the words are asked again for the new choice. */
export function backToPhoto() {
  set({ step: 'pick', names: undefined, picks: {}, aiError: undefined })
}

/** The kept words as cards, each with its object's cut-out as the picture. */
export async function addCards() {
  const { photo, names, chosen } = state
  if (!photo || !names || state.adding) return
  const plan = plannedCards(names, state.picks, chosen.length, state.context)
  if (!plan.length) return
  set({ adding: true })
  try {
    const crops = new Map<number, NewMedia | null>()
    for (const p of plan) {
      if (!crops.has(p.index)) crops.set(p.index, await cropFromImage(photo.blob, padBox(chosen[p.index - 1]!.box, 0.08)))
    }
    const inputs: NewCard[] = plan.map((p) => ({
      hanzi: p.word.hanzi,
      pinyin: p.word.pinyin,
      meaning: p.word.meaning,
      tags: p.tags,
      image: crops.get(p.index) ?? undefined,
      source: { type: 'manual' },
    }))
    await createCards(inputs)
    set({ step: 'done', added: inputs.length })
  } catch (e) {
    set({ aiError: `The cards could not be saved: ${message(e)}` })
  } finally {
    set({ adding: false })
  }
}

/** Start over with a new photo. */
export function resetSnap() {
  if (state.photo) URL.revokeObjectURL(state.photo.url)
  set(fresh())
}
