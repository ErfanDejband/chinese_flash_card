// Puts what Snap needs to find objects on the device into public/, so the app serves it from its own
// address: the D-FINE-S Objects365 model (a pinned revision from Hugging Face, checked by SHA-256)
// and the ONNX runtime's WebAssembly files (copied from the installed onnxruntime-web).
// Runs before `npm run dev` and `npm run build` (CI too); files already in place are kept.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const REPO = 'onnx-community/dfine_s_obj365-ONNX'
/** Keep in step with DETECTOR_REVISION in src/vision/detector.ts (a test checks). */
const REVISION = 'a61e4cdfe4f9d3188a305d91e37dbf38688ffbb8'
const MODEL_DIR = join(root, 'public/models/dfine_s_obj365')
const FILES = [
  { path: 'config.json', sha256: '95c10332980a8f078418f142d32aed89149cd4c46e7951f0d7b8bad38ee96689' },
  { path: 'preprocessor_config.json', sha256: 'cd38cd59999e7a95d68e487fbe5132df3d4e5c32a0836add57e6126ba0c4eaf1' },
  { path: 'onnx/model_quantized.onnx', sha256: '6f4343599a65e57cc299980db0cca320d7fc27e92c57d682a12fe0d7daf891db' },
  { path: 'onnx/model.onnx', sha256: '372feaa33ac6ba67d7df8589628f6abc395b3c6981c4edc70dfcfe2949751120' },
]

const ORT_DIR = join(root, 'public/ort')
const ORT_FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function readOrNull(file) {
  try {
    return await readFile(file)
  } catch {
    return null
  }
}

for (const { path, sha256: expected } of FILES) {
  const target = join(MODEL_DIR, path)
  const existing = await readOrNull(target)
  if (existing && sha256(existing) === expected) continue
  const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${path}`
  process.stdout.write(`fetch-vision: downloading ${path}… `)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch-vision: ${url} answered ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (sha256(bytes) !== expected) throw new Error(`fetch-vision: ${path} does not match its SHA-256`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes)
  console.log(`${(bytes.length / 1e6).toFixed(1)} MB`)
}

await mkdir(ORT_DIR, { recursive: true })
for (const name of ORT_FILES) {
  const source = join(root, 'node_modules/onnxruntime-web/dist', name)
  const [from, to] = await Promise.all([readFile(source), readOrNull(join(ORT_DIR, name))])
  if (!to || sha256(from) !== sha256(to)) await copyFile(source, join(ORT_DIR, name))
}
