/**
 * Bakes the two boss sprites — the middle manager and the auditor — from the PixelOffice pack's own characters.
 *
 * The point of the bosses having sprites at all is that they read as bosses; the point of *these* is that they read as
 * this game. So the face, the hair, the outline, the hands and the walk are the pack's: the same cut, the same recolour
 * and the same stride the herd uses (`figurePixels`, see `src/lib/hr/render/heroes.ts`), with the boss painted on top —
 * the suit and the tie, the glasses, the pen, the stance. It writes the PNGs `boss-sprites.ts` loads
 * (`assets/hr/<boss>/stand.png` + `walk-0.png … walk-5.png`), so the runtime path and the sheet-figure fallback stay as
 * they are.
 *
 * Usage:
 *   npx esbuild scripts/hr/bake-boss-sprites.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/bake-bosses.mjs
 *   node /tmp/bake-bosses.mjs            # write the sprite PNGs
 *   node /tmp/bake-bosses.mjs --preview  # print every frame as ASCII, to design the dress patches against
 *
 * The art derives from `assets/pixeloffice/PixelOfficeAssets.png` (2dPig, CC0 — see `assets/pixeloffice/README.txt`).
 */
import { deflateSync, inflateSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHARACTER_FRAMES, recolor, shirtColors } from "@/lib/tycoon/render-support/characters";
import { POSE_PAD, poseFrame, posePatches, SPRITE_COLORS, STEP_CYCLE, type Patch, type Pixels } from "@/lib/tycoon/render-support/poses";

// The repository root: the bundle lands outside the tree, so the script is run from the repo.
const root = process.cwd();
if (!existsSync(join(root, "assets/pixeloffice/PixelOfficeAssets.png"))) {
  throw new Error("run this from the repository root");
}
void dirname;
void fileURLToPath;

// ---- PNG -----------------------------------------------------------------------------------------------------------

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The pack's sheet as raw RGBA. It is a plain non-interlaced 8-bit PNG, so this decoder stays small. */
function decodePng(buffer: Buffer): { data: Uint8ClampedArray; width: number; height: number } {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  const chunks: Buffer[] = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6) throw new Error("expected an 8-bit RGBA sheet");
    } else if (type === "IDAT") chunks.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]!;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const to = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : new Uint8ClampedArray(stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? to[i - 4]! : 0;
      const up = prev[i]!;
      const upLeft = i >= 4 ? prev[i - 4]! : 0;
      let value = line[i]!;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      to[i] = value & 0xff;
    }
  }
  return { data: out, width, height };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  const table = CRC_TABLE;
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff]!;
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng({ data, width, height }: Pixels): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const at = y * (1 + width * 4);
    raw[at] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      const to = at + 1 + x * 4;
      raw[to] = data[from]!;
      raw[to + 1] = data[from + 1]!;
      raw[to + 2] = data[from + 2]!;
      raw[to + 3] = data[from + 3]!;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---- The pack's frames, dressed as a boss --------------------------------------------------------------------------
//
// A boss is a sheet character (cut, recoloured, posed) with `dress` painted over the torso and the hands. Patches are
// in the posed frame's own coordinates: the character's x plus POSE_PAD.left, and its y as drawn.

interface Boss {
  /** Which pack character, and the hair ramp it wears (see `HAIR_RAMPS`). */
  character: number;
  hair: number;
  /** Skirt-tails of the outfit: painted over the pack's shirt, in its palette letters. */
  dress: readonly Patch[];
  /** World units per sprite pixel, for `BOSS_SPRITE_PIXEL`. */
  pixel: number;
}

const BOSSES: Record<string, Boss> = {
  // The middle manager: the dark-haired character with brown hair, in the navy suit and red tie he hands out. The
  // patches repaint his striped shirt as the jacket, keeping the pack's own hands, shading and hem, with the white
  // collar and the tie showing at the front of it. Patches are in the character's own frame coordinates.
  "middle-manager": {
    character: 0,
    hair: 2,
    pixel: 3.5,
    dress: [
      { x: 4, y: 13, rows: ["bbgggg"] },
      { x: 3, y: 14, rows: ["bbbgddg", "bbbgddg", "bebbddb", "abbbddb"] },
      { x: 10, y: 16, rows: ["b", "b"] },
    ],
  },
  // The auditor: the character the pack drew glasses on, with silver hair. He already wears the white shirt and the
  // tie; the shaded grey of the suit and the red pen at his side are what make him the auditor.
  auditor: {
    character: 2,
    hair: 7,
    pixel: 3.9,
    dress: [
      { x: 2, y: 11, rows: ["c", "c"] },
      { x: 9, y: 12, rows: ["c"] },
      { x: 1, y: 14, rows: ["g", "d", "d", "d", "a"] },
    ],
  },
};

/** The character's frame, cut out of the sheet exactly as `figurePixels` cuts it. */
function cut(sheet: Pixels, character: number): Pixels {
  const [x0, y0, width, height] = CHARACTER_FRAMES[character]!;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = ((y0 + y) * sheet.width + x0) * 4;
    data.set(sheet.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { data, width, height };
}

/** The walk frames the loader asks for (`BOSS_SPRITE_WALK_FRAMES` in `boss-sprites.ts`). */
const WALK_FRAMES = 6;

/**
 * A boss's frames: standing, then the pack's four strides round again, so the six walk frames the loader asks for
 * cycle the pack's own walk evenly. The dress goes on last, over every frame's torso.
 */
function framesOf(sheet: Pixels, boss: Boss): Patch[][] {
  const base = cut(sheet, boss.character);
  recolor(base.data, base.width, boss.character, boss.hair, 0);
  const strides = Array.from({ length: WALK_FRAMES }, (_, index) => STEP_CYCLE[index % STEP_CYCLE.length]!);
  return [undefined, ...strides].map((pose) => [...(pose ? posePatches(boss.character, pose) : []), ...boss.dress]);
}

function bakeFrame(sheet: Pixels, boss: Boss, patches: readonly Patch[]): Pixels {
  const base = cut(sheet, boss.character);
  recolor(base.data, base.width, boss.character, boss.hair, 0);
  return poseFrame(base, patches, shirtColors(boss.character, 0));
}

// ---- Preview and main ----------------------------------------------------------------------------------------------

function ascii(frame: Pixels): string {
  const letters = new Map<string, string>();
  const palette = Object.entries(SPRITE_COLORS) as [string, readonly [number, number, number]][];
  const rows: string[] = [];
  for (let y = 0; y < frame.height; y += 1) {
    let row = "";
    for (let x = 0; x < frame.width; x += 1) {
      const at = (y * frame.width + x) * 4;
      if (frame.data[at + 3] === 0) {
        row += ".";
        continue;
      }
      const key = `${frame.data[at]},${frame.data[at + 1]},${frame.data[at + 2]}`;
      let letter = letters.get(key);
      if (!letter) {
        const match = palette.find(([, rgb]) => rgb.join(",") === key);
        letter = match ? match[0] : "?";
        letters.set(key, letter);
      }
      row += letter;
    }
    rows.push(row);
  }
  const ruler = Array.from({ length: frame.width }, (_, x) => (x % 10 === 0 ? String(Math.floor(x / 10) % 10) : " ")).join("");
  return `${ruler}\n${rows.map((row, y) => `${String(y).padStart(2)} ${row}`).join("\n")}`;
}

const sheet = decodePng(readFileSync(join(root, "assets/pixeloffice/PixelOfficeAssets.png")));

if (process.argv.includes("--preview")) {
  for (const [name, boss] of Object.entries(BOSSES)) {
    console.log(`\n=== ${name} (character ${boss.character}) ===`);
    const patches = framesOf(sheet, boss);
    patches.forEach((framePatches, index) => {
      console.log(`-- ${index === 0 ? "stand" : `walk-${index - 1}`}`);
      console.log(ascii(bakeFrame(sheet, boss, framePatches)));
    });
  }
} else {
  for (const [name, boss] of Object.entries(BOSSES)) {
    const dir = join(root, "assets", "hr", name);
    mkdirSync(dir, { recursive: true });
    framesOf(sheet, boss).forEach((patches, index) => {
      const frame = bakeFrame(sheet, boss, patches);
      const file = join(dir, index === 0 ? "stand.png" : `walk-${index - 1}.png`);
      writeFileSync(file, encodePng(frame));
      console.log("wrote", file, `${frame.width}x${frame.height}`);
    });
  }
}
