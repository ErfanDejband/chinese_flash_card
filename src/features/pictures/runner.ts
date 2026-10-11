import type { PictureDraftRecord, PictureSheetRecord } from '@/data/db'
import {
  addPictureSheets,
  getPictureJob,
  listPictureDrafts,
  listPictureSheets,
  markSheetError,
  savePlans,
  saveSheetResult,
  setPictureJobStatus,
  updatePictureDraft,
} from '@/data/repositories/pictures'
import { configProblems, createProvider } from '@/import/ai/createProvider'
import { bytesToBase64 } from '@/import/ai/http'
import { ProviderError, type VisionProvider } from '@/import/ai/types'
import { cropFromImage } from '@/import/pdf/crop'
import { activeProviderConfig, getAiSettings, pictureSetup } from '@/lib/aiConfig'
import { finishRun, recordUsage, startRun as startUsageRun } from '@/lib/aiUsage'
import { setBusy } from '@/lib/busy'
import { prepareImage } from '@/lib/image'
import { createGenerator, pictureSetupProblems } from '@/pictures/createGenerator'
import { renderEmoji } from '@/pictures/emoji'
import { makeSheet, planPictures, type SheetCell, type UsageSink } from '@/pictures/make'
import { DEFAULT_SHEET_SIZE, groupIntoSheets } from '@/pictures/sheet'
import { pictureStyle } from '@/pictures/styles'

/**
 * Making pictures runs outside React (like the import runner) so it keeps going while the user
 * looks around; the job page subscribes to this state.
 */
export interface PictureRunState {
  jobId?: string
  phase: 'idle' | 'planning' | 'running' | 'waiting' | 'stopping'
  /** "Sheet 2 of 3" */
  step?: string
  waitingUntil?: number
  /** Error that stopped the last run (bad key, no credit, …). */
  fatal?: string
}

let state: PictureRunState = { phase: 'idle' }
let controller: AbortController | undefined
const listeners = new Set<() => void>()

function set(next: Partial<PictureRunState>) {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export const pictureRunStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export const isPictureRunActive = (jobId?: string) => state.phase !== 'idle' && (jobId === undefined || state.jobId === jobId)

/** The import AI plans the pictures and finds them on a sheet; none when it isn't set up. */
function assistant(): VisionProvider | undefined {
  const config = activeProviderConfig(getAiSettings())
  return configProblems(config).length ? undefined : createProvider(config)
}

const usageSink = (service: string): UsageSink => {
  const config = activeProviderConfig(getAiSettings())
  return {
    assistant: (model, usage) => recordUsage(config.provider, model || config.model, usage),
    image: (model, usage) => recordUsage(service, model, usage),
  }
}

async function exclusive(jobId: string, phase: 'planning' | 'running', work: (signal: AbortSignal) => Promise<void>): Promise<void> {
  if (state.phase !== 'idle') return
  controller = new AbortController()
  set({ jobId, phase, step: undefined, fatal: undefined, waitingUntil: undefined })
  // A sign-in hop (full-page navigation) would stop the run.
  setBusy('pictures', true)
  try {
    await work(controller.signal)
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) set({ fatal: e instanceof Error ? e.message : String(e) })
  } finally {
    controller = undefined
    setBusy('pictures', false)
    set({ phase: 'idle', step: undefined, waitingUntil: undefined })
  }
}

const retry = (signal: AbortSignal) => ({
  signal,
  onWait: (ms: number) => set({ phase: 'waiting', waitingUntil: Date.now() + ms }),
})

/** Ask the import AI how to picture each word (one request per 30 words). */
export function planJob(jobId: string): Promise<void> {
  return exclusive(jobId, 'planning', async (signal) => {
    const drafts = await listPictureDrafts(jobId)
    const words = drafts.map((d) => ({ hanzi: d.hanzi, pinyin: d.pinyin, meaning: d.meaning }))
    const { plans, failed } = await planPictures(words, assistant(), { ...retry(signal), usage: usageSink('') })
    await savePlans(jobId, plans, failed)
  })
}

const cellOf = (d: PictureDraftRecord): SheetCell => {
  const scene = d.plan?.scene || d.meaning || d.hanzi
  return { scene, label: `${d.meaning || d.hanzi}: ${scene}` }
}

/** Generate, locate and cut one sheet, then store its pictures. */
async function runSheet(sheet: PictureSheetRecord, drafts: Map<string, PictureDraftRecord>, signal: AbortSignal): Promise<void> {
  const job = (await getPictureJob(sheet.jobId))!
  const setup = pictureSetup(getAiSettings())
  const generator = createGenerator(setup)
  const cells = sheet.cardIds.map((id) => cellOf(drafts.get(id)!))
  const made = await makeSheet(cells, pictureStyle(job.style), generator, assistant(), {
    ...retry(signal),
    variants: sheet.variants,
    usage: usageSink(setup.service),
    toBase64: async (blob) => {
      const small = await prepareImage(blob, 1280)
      return bytesToBase64(new Uint8Array(await small.blob.arrayBuffer()))
    },
  })
  // Kept for adjusting crops: re-encoded so a big PNG doesn't fill the device.
  const stored = await prepareImage(made.image, 2048)
  const pictures = await Promise.all(made.boxes.map((box) => cropFromImage(stored.blob, box)))
  await saveSheetResult(sheet.id, { image: stored.blob, width: stored.width, height: stored.height, boxes: made.boxes, pictures })
}

/** Errors that fail every sheet the same way: stop instead of trying the rest. */
const isFatal = (e: unknown) => e instanceof ProviderError && (e.kind === 'auth' || e.kind === 'quota' || e.status === 402 || e.status === 404)

async function runPendingSheets(jobId: string, signal: AbortSignal): Promise<void> {
  const drafts = new Map((await listPictureDrafts(jobId)).map((d) => [d.cardId, d]))
  const pending = (await listPictureSheets(jobId)).filter((s) => s.status === 'pending')
  for (const [i, sheet] of pending.entries()) {
    if (signal.aborted) throw signal.reason
    set({ phase: 'running', step: sheet.variants ? 'Drawing 4 versions' : `Sheet ${i + 1} of ${pending.length}`, waitingUntil: undefined })
    try {
      await runSheet(sheet, drafts, signal)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      const message = e instanceof Error ? e.message : String(e)
      await markSheetError(sheet.id, message)
      if (isFatal(e)) throw e
    }
  }
}

/** Make pictures for every included card that has none yet. */
export function runJob(jobId: string): Promise<void> {
  return exclusive(jobId, 'running', async (signal) => {
    const job = await getPictureJob(jobId)
    if (!job) return
    const todo = (await listPictureDrafts(jobId)).filter((d) => d.include && d.status !== 'ready')
    if (job.method === 'emoji') {
      for (const d of todo) {
        if (!d.plan?.emoji) {
          await updatePictureDraft(d.id, { status: 'failed', error: 'No emoji fits this word.' })
          continue
        }
        await updatePictureDraft(d.id, { status: 'ready', picture: await renderEmoji(d.plan.emoji), error: undefined })
      }
    } else {
      const setup = pictureSetup(getAiSettings())
      const problems = pictureSetupProblems(setup)
      if (problems.length) throw new Error(problems.join(' '))
      await setPictureJobStatus(jobId, 'running', { method: 'paid', style: job.style, perSheet: job.perSheet, service: setup.service, model: setup.model })
      startUsageRun({ importId: jobId, fileName: 'Pictures', provider: setup.service, model: setup.model })
      try {
        const sheets = await listPictureSheets(jobId)
        const queued = new Set(sheets.filter((s) => s.status === 'pending' && !s.variants).flatMap((s) => s.cardIds))
        const fresh = todo.filter((d) => !queued.has(d.cardId)).map((d) => d.cardId)
        await addPictureSheets(jobId, groupIntoSheets(fresh, job.perSheet ?? DEFAULT_SHEET_SIZE).map((cardIds) => ({ cardIds, variants: false })))
        await runPendingSheets(jobId, signal)
      } finally {
        finishRun()
      }
    }
    await setPictureJobStatus(jobId, 'review')
  })
}

/** Four new versions of one card's picture, to choose from. */
export function regenerate(jobId: string, cardId: string): Promise<void> {
  return exclusive(jobId, 'running', async (signal) => {
    const setup = pictureSetup(getAiSettings())
    const problems = pictureSetupProblems(setup)
    if (problems.length) throw new Error(problems.join(' '))
    startUsageRun({ importId: jobId, fileName: 'Pictures', provider: setup.service, model: setup.model })
    try {
      await addPictureSheets(jobId, [{ cardIds: [cardId], variants: true }])
      await runPendingSheets(jobId, signal)
    } finally {
      finishRun()
    }
  })
}

export function stopPictureRun(): void {
  if (!controller) return
  set({ phase: 'stopping' })
  controller.abort(new DOMException('Stopped by the user', 'AbortError'))
}
