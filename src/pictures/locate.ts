import { ModelOutputError, parseBox } from '@/import/ai/parse'
import type { JsonTask } from '@/import/ai/prompt'
import type { NormBox } from '@/import/types'
import { gridBox, type SheetLayout } from './sheet'

/** Bump when the locate prompt or schema changes. */
export const LOCATE_PROMPT_VERSION = 1

const SYSTEM = `You are given ONE image that holds several separate pictures in a grid, and a numbered list of what each picture should show. Find the picture that best matches each description and return its bounding box. Reply with JSON only.

- box: [ymin, xmin, ymax, xmax] normalised to 0-1000 relative to the whole image, tight around that one picture (not its neighbours, not the white gutter).
- Use each picture at most once. The pictures may not be in the listed order.
- If no picture matches a description, use null.`

const JSON_SHAPE = `Reply with a JSON object of exactly this shape:
{"pictures":[{"index":1,"box":[40,30,470,310]},{"index":2,"box":null}]}`

export const LOCATE_TASK: JsonTask = {
  id: 'picture-locate',
  version: LOCATE_PROMPT_VERSION,
  system: SYSTEM,
  user: (list) => `Find these pictures in the image:\n${list}`,
  jsonShape: JSON_SHAPE,
  geminiSchema: {
    type: 'OBJECT',
    properties: {
      pictures: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { index: { type: 'INTEGER' }, box: { type: 'ARRAY', items: { type: 'INTEGER' }, nullable: true } },
          required: ['index', 'box'],
          propertyOrdering: ['index', 'box'],
        },
      },
    },
    required: ['pictures'],
  },
  jsonSchema: {
    type: 'object',
    properties: {
      pictures: {
        type: 'array',
        items: {
          type: 'object',
          properties: { index: { type: 'integer' }, box: { anyOf: [{ type: 'array', items: { type: 'integer' } }, { type: 'null' }] } },
          required: ['index', 'box'],
          additionalProperties: false,
        },
      },
    },
    required: ['pictures'],
    additionalProperties: false,
  },
}

/** The descriptions, numbered in cell order, as the user message. */
export const locateInput = (labels: string[]) => labels.map((l, i) => `${i + 1}. ${l}`).join('\n')

/** Boxes by 1-based index from a locate reply (invalid ones dropped). */
export function validateLocate(json: unknown): Map<number, NormBox> {
  const raw = json && typeof json === 'object' ? (json as { pictures?: unknown }).pictures : undefined
  if (!Array.isArray(raw)) throw new ModelOutputError('The model reply has no "pictures" list.')
  const boxes = new Map<number, NormBox>()
  for (const r of raw) {
    const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const box = parseBox(o.box)
    if (typeof o.index === 'number' && box) boxes.set(o.index, box)
  }
  return boxes
}

const area = (b: NormBox) => ((b[2] - b[0]) * (b[3] - b[1])) / 1_000_000

function overlap(a: NormBox, b: NormBox): number {
  const h = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const w = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const inter = (h * w) / 1_000_000
  return inter / (area(a) + area(b) - inter)
}

/** Room around a located box so the crop isn't cut tight against the drawing. */
function pad(b: NormBox, by = 12): NormBox {
  return [Math.max(0, b[0] - by), Math.max(0, b[1] - by), Math.min(1000, b[2] + by), Math.min(1000, b[3] + by)]
}

/**
 * The crop for each of `count` cells: the located box when it is plausible (not tiny, not most
 * of the sheet, not on top of another picture), otherwise the cell of the grid the picture was
 * asked for. `located[i]` says which.
 */
export function resolveBoxes(layout: SheetLayout, count: number, found: ReadonlyMap<number, NormBox>): { boxes: NormBox[]; located: boolean[] } {
  const maxArea = Math.min(0.7, 2.5 / (layout.cols * layout.rows))
  const boxes: NormBox[] = []
  const located: boolean[] = []
  for (let i = 0; i < count; i++) {
    const b = found.get(i + 1)
    const ok = b && area(b) >= 0.01 && area(b) <= maxArea && !boxes.some((other, j) => located[j] && overlap(other, b) > 0.4)
    boxes.push(ok ? pad(b) : gridBox(layout, i))
    located.push(Boolean(ok))
  }
  return { boxes, located }
}
