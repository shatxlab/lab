// Bakes the hand-authored boss figures — the middle manager and the auditor — into the PNGs the
// sprite loader expects (`assets/hr/<boss>/stand.png` + `walk-0.png … walk-5.png`), replacing the
// off-style PixelLab generations. The art is written here as string rows in the PixelOffice
// palette (the SPRITE_COLORS of `src/lib/tycoon/render-support/poses.ts`, plus boss-only ramps of
// the same shape): '.' leaves the pixel transparent, a letter paints it. Frames are 18x25,
// south-facing, feet on the bottom row; only the legs move between the walk frames, exactly like
// the pack's own walk cycles ("the body does not move: only the legs carry the walk").
//
// Usage: `node scripts/hr/bake-boss-sprites.mjs` writes the PNGs; `--preview` prints ASCII instead.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The palette, by the letters the rows are written in. Lower-case letters are the pack's own
// SPRITE_COLORS; the boss colours keep the same three-step ramp shape.
const COLORS = {
  a: "#1a1c2c", // outline
  b: "#333c57", // navy
  c: "#566c86", // slate
  d: "#b13e53", // red
  e: "#ef7d57", // dark skin
  f: "#94b0c2", // steel
  g: "#f4f4f4", // white
  h: "#4a2618", // dark brown (hair shadow)
  j: "#ffcd75", // light skin
  n: "#a8744a", // light brown
  p: "#262638", // near-black navy (suit shadow, trousers)
  u: "#b0b6be", // light gray
  v: "#4a556e", // dark slate (gray-suit shadow, trousers)
  w: "#8a9199", // gray
};

const WIDTH = 18;
const HEIGHT = 25;

/** Joins the row's parts and refuses to bake a row that is not exactly the canvas wide. */
function R(...parts) {
  const row = parts.join("");
  if (row.length !== WIDTH) throw new Error(`row "${row}" is ${row.length} wide, expected ${WIDTH}`);
  return row;
}
const rep = (ch, n) => ch.repeat(n);

// ---- The middle manager --------------------------------------------------------------------------------------------
//
// Stocky, frowning, in the navy suit he hands out: white shirt, red tie, dark-brown slicked hair with a
// widow's peak, and fists clenched at his sides. The head and torso never move; the walk frames swap the
// leg rows (19-24) only, so his body stays put while his feet carry him.

const MANAGER_TORSO = [
  R(rep(".", 4), rep("a", 10), rep(".", 4)), // 0
  R("...", "a", rep("h", 10), "a", "..."), // 1
  R("..", "a", rep("h", 12), "a", ".."), // 2
  R("..", "a", "hnnhhhhhhnnh", "a", ".."), // 3 the slick, with its shine
  R("..", "a", "h", rep("j", 10), "h", "a", ".."), // 4 the widow's peak leaves the forehead
  R("..", "h", "j", "aa", rep("j", 6), "aa", "j", "h", ".."), // 5 the brows he frowns with
  R("..", "h", "jj", "a", rep("j", 6), "a", "jj", "h", ".."), // 6 the eyes under them
  R("..", "h", rep("j", 5), "e", rep("j", 6), "h", ".."), // 7 the nose
  R("..", "h", rep("j", 3), rep("a", 6), rep("j", 3), "h", ".."), // 8 the grim mouth
  R("...", "a", rep("j", 10), "a", "..."), // 9 the chin
  R(rep(".", 4), "a", rep("e", 8), "a", rep(".", 4)), // 10 the shaven jaw
  R(".", "a", "bbb", rep("g", 8), "bbb", "a", "."), // 11 shoulders over the white collar
  R(".", "a", "bbbb", "gg", "dd", "gg", "bbbb", "a", "."), // 12 the tie's knot over the shirt
  R("a", "bbbbb", "gg", "dd", "gg", "bbbbb", "a"), // 13 the suit's arms join the shoulders
  R("a", "jjbbp", "gg", "dd", "gg", "pbbjj", "a"), // 14 the sleeves run down to the fists
  R("a", "jjbbp", "gg", "dd", "gg", "pbbjj", "a"), // 15 the fists clench at the hips
  R("a", "jj", rep("p", 12), "jj", "a"), // 16 the jacket closes below the tie
  R(".", "aapp", rep("p", 8), "ppaa", "."), // 17 the jacket's hem
  R("..", "a", rep("p", 12), "a", ".."), // 18 the trousers' waistband
];

// Leg rows (19-24): outlined trousers with two rows of black shoes. A stride spreads the legs a
// column apart; a lift raises one foot a row off the floor.
const leg = (padL, padR) => R(rep(".", padL), "a", rep("p", 4), "a", rep(".", padR));
const shoe = (padL, padR) => R(rep(".", padL), rep("a", 6), rep(".", padR));
const blank = () => R(rep(".", WIDTH));

function managerLegs(leftPad, rightPad, lift) {
  // `leftPad`/`rightPad` place the two 6-wide legs; a lifted leg loses its bottom shoe row.
  const mid = WIDTH - leftPad - rightPad - 12;
  if (mid < 0) throw new Error("legs overlap");
  const legRow = (fill) => R(rep(".", leftPad), fill, rep(".", mid), fill, rep(".", rightPad));
  const trousers = legRow("appppa");
  const shoes = legRow("aaaaaa");
  const below =
    lift === "left"
      ? R(rep(".", leftPad + 6), rep(".", mid), "aaaaaa", rep(".", rightPad))
      : lift === "right"
        ? R(rep(".", leftPad), "aaaaaa", rep(".", mid + 6 + rightPad))
        : shoes;
  return [trousers, trousers, trousers, trousers, shoes, below];
}

const MANAGER_STAND = [...MANAGER_TORSO, ...managerLegs(2, 2)];
const MANAGER_WALK = [
  [...MANAGER_TORSO, ...managerLegs(1, 2)], // the left foot swings out
  [...MANAGER_TORSO, ...managerLegs(2, 2, "left")], // the left foot lifts
  [...MANAGER_TORSO, ...managerLegs(2, 2)], // the feet pass
  [...MANAGER_TORSO, ...managerLegs(2, 1)], // the right foot swings out
  [...MANAGER_TORSO, ...managerLegs(2, 2, "right")], // the right foot lifts
  [...MANAGER_TORSO, ...managerLegs(2, 2)], // the feet pass
];

// ---- The auditor ----------------------------------------------------------------------------------------------------
//
// Tall and thin, silver-haired with the parting showing, in the gray suit he audits in, with glasses low on
// the nose and the fat red pen he marks the books with held at his side, its nib reaching the floor.

const AUDITOR_TORSO = [
  R(rep(".", 4), rep("a", 10), rep(".", 4)), // 0
  R("...", "a", rep("f", 10), "a", "..."), // 1
  R("..", "a", rep("f", 12), "a", ".."), // 2
  R("..", "a", "fcffffffffcf", "a", ".."), // 3 the parting's shade
  R("..", "a", "c", rep("j", 10), "c", "a", ".."), // 4 the high forehead
  R("..", "c", "j", "aa", rep("j", 6), "aa", "j", "c", ".."), // 5 the brows, drawn in judgement
  R("..", "c", "j", "aff", "a", "jj", "a", "ffa", "j", "c", ".."), // 6 the glasses, low on the nose
  R("..", "c", rep("j", 5), "e", rep("j", 6), "c", ".."), // 7 the nose under them
  R("..", "c", rep("j", 3), rep("a", 4), rep("j", 5), "c", ".."), // 8 the set mouth
  R("...", "a", rep("j", 10), "a", "..."), // 9 the chin
  R(rep(".", 4), "a", rep("e", 8), "a", rep(".", 4)), // 10 the jaw
  R("...", "a", rep("w", 10), "a", "..."), // 11 the narrow shoulders
  R("..", "a", rep("w", 5), "bb", rep("w", 5), "a", ".."), // 12 the collar and the dark tie
  R(".", "a", rep("w", 5), "bb", rep("w", 5), "j", "gg", "a"), // 13 the sleeve runs down to the hand
  R(".", "a", rep("w", 5), "bb", rep("w", 5), "j", "gg", "a"), // 14 the pen's white cap, past the hand
  R(".", "a", rep("u", 5), "bb", rep("v", 5), "j", "gg", "a"), // 15 the fist closes on it; light from the left
  R(".", "a", rep("u", 5), "bb", rep("v", 5), "j", "dd", "a"), // 16 the pen's barrel, in the fist
  R(".", "a", rep("u", 5), "bb", rep("v", 6), "dd", "a"), // 17 the barrel runs below the hand
  R("..", "a", rep("v", 11), "a", "dd", "a"), // 18 the jacket's hem, the pen beside it
];

function auditorLegs(leftStart, rightStart, lift) {
  // Two 4-wide legs (standing: cols 4-7 and 10-13), with the pen's barrel (cols 15-16) running
  // down to its nib, which touches the floor as the feet do. A lifted leg loses its bottom row.
  const legRow = (left, right, tail) =>
    R(rep(".", leftStart), left, rep(".", rightStart - leftStart - 4), right, rep(".", 15 - rightStart - 4), tail, "a");
  const trousers = legRow("avva", "avva", "dd");
  const shoes = legRow("aaaa", "aaaa", "ff");
  const liftedLeft = legRow("....", "aaaa", "ff");
  const liftedRight = legRow("aaaa", "....", "ff");
  return [trousers, trousers, trousers, trousers, lift === "left" ? liftedLeft : shoes, lift === "right" ? liftedRight : shoes];
}

const AUDITOR_STAND = [...AUDITOR_TORSO, ...auditorLegs(4, 10)];
const AUDITOR_WALK = [
  [...AUDITOR_TORSO, ...auditorLegs(3, 10)], // the left foot swings out
  [...AUDITOR_TORSO, ...auditorLegs(4, 10, "left")], // the left foot lifts
  [...AUDITOR_TORSO, ...auditorLegs(4, 10)], // the feet pass
  [...AUDITOR_TORSO, ...auditorLegs(4, 11)], // the right foot swings out
  [...AUDITOR_TORSO, ...auditorLegs(4, 10, "right")], // the right foot lifts
  [...AUDITOR_TORSO, ...auditorLegs(4, 10)], // the feet pass
];

// ---- Frames, preview, PNG -------------------------------------------------------------------------------------------

const BOSSES = {
  "middle-manager": { stand: MANAGER_STAND, walk: MANAGER_WALK },
  auditor: { stand: AUDITOR_STAND, walk: AUDITOR_WALK },
};

function framesOf(boss) {
  const frames = [boss.stand, ...boss.walk];
  for (const frame of frames) {
    if (frame.length !== HEIGHT) throw new Error(`frame has ${frame.length} rows, expected ${HEIGHT}`);
    if (frame[HEIGHT - 1].includes("j") || !frame[HEIGHT - 1].match(/a|f/)) {
      // nothing enforced here; the preview is the check for feet on the floor
    }
  }
  return frames;
}

function preview(name, boss) {
  console.log(`\n=== ${name} ===`);
  for (const [label, frame] of [["stand", boss.stand], ...boss.walk.map((f, i) => [`walk-${i}`, f])]) {
    console.log(`-- ${label}`);
    console.log(frame.join("\n"));
  }
}

// ---- PNG: eight-bit RGBA, one filtered scanline per row, deflate-compressed -----------------------------------------

function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(rows) {
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 4));
  rows.forEach((row, y) => {
    const at = y * (1 + WIDTH * 4);
    raw[at] = 0; // filter: none
    for (let x = 0; x < WIDTH; x += 1) {
      const mark = row[x];
      const color = COLORS[mark];
      const pixel = at + 1 + x * 4;
      if (!color) continue; // '.' and any unlisted mark stay transparent
      const [r, g, b] = color.match(/^#(..)(..)(..)$/).slice(1).map((hex) => Number.parseInt(hex, 16));
      raw[pixel] = r;
      raw[pixel + 1] = g;
      raw[pixel + 2] = b;
      raw[pixel + 3] = 255;
    }
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

if (process.argv.includes("--preview")) {
  for (const [name, boss] of Object.entries(BOSSES)) preview(name, boss);
} else {
  for (const [name, boss] of Object.entries(BOSSES)) {
    const dir = join(root, "assets", "hr", name);
    mkdirSync(dir, { recursive: true });
    const frames = [boss.stand, ...boss.walk];
    frames.forEach((frame, index) => {
      const file = join(dir, index === 0 ? "stand.png" : `walk-${index - 1}.png`);
      writeFileSync(file, encodePng(framesOf(boss)[index]));
      console.log("wrote", file);
    });
  }
}
