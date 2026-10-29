import { decodeDetections, type Detection } from './detections'

/**
 * D-FINE-S trained on Objects365 (365 everyday kinds of things, Apache-2.0), as ONNX for
 * Transformers.js. Pinned to a revision so a re-upload can't change what the lab measures.
 */
export const DETECTOR_MODEL = 'onnx-community/dfine_s_obj365-ONNX'
export const DETECTOR_REVISION = 'a61e4cdfe4f9d3188a305d91e37dbf38688ffbb8'

export type DetectorBackend = 'webgpu' | 'wasm'
/** `q8` = model_quantized.onnx (11.3 MB), `fp16` 21.3 MB, `fp32` 42.1 MB. */
export type DetectorDtype = 'q8' | 'fp16' | 'fp32'

export interface LoadReport {
  backend: DetectorBackend
  dtype: DetectorDtype
  ms: number
  /** Bytes the download reported (0 when everything came from the browser cache). */
  bytes: number
  /** The model file was already in the browser cache before loading. */
  cached: boolean
}

export interface DetectResult {
  /** Every query's best guess, best first (also the weak ones: a tap can pick them). */
  detections: Detection[]
  ms: number
}

export interface Detector {
  backend: DetectorBackend
  dtype: DetectorDtype
  detect(image: HTMLCanvasElement): Promise<DetectResult>
  dispose(): Promise<void>
}

export interface GpuInfo {
  available: boolean
  /** Vendor and architecture, when the browser says. */
  adapter?: string
  /** Half-precision shaders (`shader-f16`): needed for the fp16 model on WebGPU. */
  fp16?: boolean
}

interface GpuAdapterLike {
  info?: { vendor?: string; architecture?: string }
  features?: { has(name: string): boolean }
}

/** Whether this browser offers WebGPU, and what the adapter can do. */
export async function webGpuInfo(): Promise<GpuInfo> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> } }).gpu
  if (!gpu) return { available: false }
  try {
    const adapter = await gpu.requestAdapter()
    if (!adapter) return { available: false }
    const info = adapter.info
    return {
      available: true,
      adapter: [info?.vendor, info?.architecture].filter(Boolean).join(' ') || undefined,
      fp16: Boolean(adapter.features?.has('shader-f16')),
    }
  } catch {
    return { available: false }
  }
}

const FILE_OF: Record<DetectorDtype, string> = { q8: 'model_quantized.onnx', fp16: 'model_fp16.onnx', fp32: 'model.onnx' }

/**
 * Where the model and the ONNX runtime come from: `app` = the app's own address (Snap; put there
 * by scripts/fetch-vision.mjs, which hosts the fp32 and int8 models), `hub` = Hugging Face and
 * jsDelivr (the lab, for setups the app doesn't host).
 */
export type DetectorSource = 'app' | 'hub'

/** The model's folder under `public/models/` (scripts/fetch-vision.mjs). */
const APP_MODEL = 'dfine_s_obj365'
const ORT_WASM = 'ort-wasm-simd-threaded.asyncify'

async function inCache(cacheKey: string, model: string, file: string): Promise<boolean> {
  try {
    if (!(await caches.has(cacheKey))) return false
    const keys = await (await caches.open(cacheKey)).keys()
    return keys.some((r) => r.url.includes(model) && r.url.endsWith(file))
  } catch {
    return false
  }
}

type OnnxWasmEnv = { wasmPaths?: unknown }
/** Transformers.js points the runtime at jsDelivr when it loads; kept to switch back for `hub`. */
let hubWasmPaths: unknown
let hubWasmPathsKept = false

/**
 * Downloads (or reads from the browser cache) the model and the ONNX runtime. The library itself
 * is only fetched when this runs.
 */
export async function loadDetector(
  backend: DetectorBackend,
  dtype: DetectorDtype,
  { onProgress, source = 'hub' }: { onProgress?: (loaded: number, total: number) => void; source?: DetectorSource } = {},
): Promise<{ detector: Detector; report: LoadReport }> {
  const { pipeline, env, RawImage } = await import('@huggingface/transformers')
  const wasm = (env.backends.onnx as { wasm?: OnnxWasmEnv }).wasm
  if (wasm && !hubWasmPathsKept) {
    hubWasmPaths = wasm.wasmPaths
    hubWasmPathsKept = true
  }
  const fromApp = source === 'app'
  const model = fromApp ? APP_MODEL : DETECTOR_MODEL
  if (fromApp) {
    const base = new URL(`${import.meta.env.BASE_URL}`, location.href)
    env.allowLocalModels = true
    env.allowRemoteModels = false
    // A path, not a full URL: Transformers.js only looks for optional files (the image processor's
    // preprocessor_config.json) at local paths that aren't URLs.
    env.localModelPath = `${import.meta.env.BASE_URL}models/`
    if (wasm) wasm.wasmPaths = { mjs: new URL(`ort/${ORT_WASM}.mjs`, base).href, wasm: new URL(`ort/${ORT_WASM}.wasm`, base).href }
  } else {
    env.allowLocalModels = false
    env.allowRemoteModels = true
    if (wasm) wasm.wasmPaths = hubWasmPaths
  }
  const cached = await inCache(env.cacheKey, model, `onnx/${FILE_OF[dtype]}`)
  const files = new Map<string, { loaded: number; total: number }>()
  const started = performance.now()
  const pipe = await pipeline('object-detection', model, {
    device: backend,
    dtype,
    revision: fromApp ? undefined : DETECTOR_REVISION,
    progress_callback: (p) => {
      if (p.status !== 'progress') return
      files.set(p.file, { loaded: p.loaded, total: p.total })
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      onProgress?.(loaded, total)
    },
  })
  const report: LoadReport = {
    backend,
    dtype,
    ms: Math.round(performance.now() - started),
    bytes: [...files.values()].reduce((sum, f) => sum + f.loaded, 0),
    cached,
  }
  const id2label = (pipe.model.config as unknown as { id2label: Record<string, string> }).id2label

  const detector: Detector = {
    backend,
    dtype,
    async detect(image) {
      const t0 = performance.now()
      const { pixel_values } = await pipe.processor(RawImage.fromCanvas(image))
      const output = (await pipe.model({ pixel_values })) as Record<string, { dims: number[]; to(type: 'float32'): { data: ArrayLike<number> } }>
      const logits = output.logits!
      const [, queries, classes] = logits.dims as [number, number, number]
      const detections = decodeDetections(logits.to('float32').data, output.pred_boxes!.to('float32').data, queries, classes, (c) => id2label[c] ?? `#${c}`)
      return { detections, ms: Math.round(performance.now() - t0) }
    },
    dispose: () => pipe.dispose(),
  }
  return { detector, report }
}
