// Draws every footballer pose, some kits and the haircuts into one zoomed PNG, to look at the art.
//
//   npx esbuild scripts/football/sprite-sheet.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/sheet.mjs
//   node /tmp/sheet.mjs /tmp/football-sheet.png [zoom]

import process from 'node:process'
import sharp from 'sharp'
import { ballPixels, BALL_SIZE, figureFor, KITS, SPRITE_H, SPRITE_W, type Pose } from '../../src/lib/football/render/sprites.ts'

const out = process.argv[2] ?? '/tmp/football-sheet.png'
const zoom = Number(process.argv[3] ?? 6)
const poses: Pose[] = ['stand', 'run0', 'run1', 'run2', 'run3', 'kick', 'slide', 'dive', 'cheer']

// Rows: one man per kit (ids chosen to show different faces), then a keeper; columns: poses. A ball ends each row.
const cell = { w: SPRITE_W + 2, h: SPRITE_H + 2 }
const rows = [...KITS.map((_, index) => ({ id: index * 3 + 1, role: 'FW' as const, kit: index })), { id: 40, role: 'GK' as const, kit: 0 }, { id: 41, role: 'GK' as const, kit: 1 }]
const width = cell.w * (poses.length + 1)
const height = cell.h * rows.length
const sheet = new Uint8ClampedArray(width * height * 4)
for (let i = 0; i < width * height; i += 1) sheet.set([88, 150, 72, 255], i * 4)
const paste = (pixels: Uint8ClampedArray, w: number, h: number, ox: number, oy: number): void => {
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const s = (y * w + x) * 4
      if (pixels[s + 3] === 0) continue
      sheet.set(pixels.subarray(s, s + 4), ((oy + y) * width + ox + x) * 4)
    }
}
rows.forEach((row, r) => {
  poses.forEach((pose, c) => paste(figureFor(row, row.kit, pose), SPRITE_W, SPRITE_H, c * cell.w + 1, r * cell.h + 1))
  paste(ballPixels(), BALL_SIZE, BALL_SIZE, poses.length * cell.w + 4, r * cell.h + 18)
})
await sharp(Buffer.from(sheet.buffer), { raw: { width, height, channels: 4 } })
  .resize(width * zoom, height * zoom, { kernel: 'nearest' })
  .png()
  .toFile(out)
console.log(out, width * zoom, 'x', height * zoom)
