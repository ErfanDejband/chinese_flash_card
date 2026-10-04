import type { Region } from '../render'

/** Taller than this (height : width) counts as a long scrolling screenshot. Phone screens are ~2.2. */
export const SPLIT_RATIO = 3
/** Tile height as a multiple of the width. */
const TILE_ASPECT = 1.6
const OVERLAP = 0.15

/**
 * Regions to send to the AI for an image of `width` × `height`. Normal images are one region;
 * very tall ones are cut into overlapping tiles (so text isn't shrunk into illegibility), with
 * the last tile flush with the bottom. Items repeated in an overlap are caught by duplicate flags.
 */
export function planTiles(width: number, height: number): Region[] {
  if (width <= 0 || height <= 0 || height / width <= SPLIT_RATIO) return [{ x: 0, y: 0, width, height }]
  const tile = Math.round(width * TILE_ASPECT)
  const step = Math.round(tile * (1 - OVERLAP))
  const tiles: Region[] = []
  for (let y = 0; ; y += step) {
    if (y + tile >= height) {
      tiles.push({ x: 0, y: height - tile, width, height: tile })
      break
    }
    tiles.push({ x: 0, y, width, height: tile })
  }
  return tiles
}
