import jsQR from "jsqr";
import { describe, expect, it } from "vitest";

import { buildMatrix } from "@/lib/qr/generate";
import { MAX_FRAGMENT_CHARS, decodeSend, encodeSend, sendLink } from "@/lib/send/codec";

/** Rasterise a matrix the way a screen shows it: dark modules on white, with a quiet zone. */
function pixels(modules: boolean[], size: number, scale = 4, margin = 4) {
  const side = (size + margin * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!modules[row * size + column]) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const at = (((row + margin) * scale + y) * side + (column + margin) * scale + x) * 4;
          data[at] = data[at + 1] = data[at + 2] = 0;
        }
      }
    }
  }
  return { data, side };
}

/** Incompressible-looking text (mulberry32), so the fragment grows steadily with the requested size. */
function noise(length: number, seed: number): string {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(next() * 36)]).join("");
}

const ORIGIN = "https://shatxlab.github.io";

describe("a sent link is scannable at the size cap", () => {
  // Raw lengths chosen to land the fragments across many QR versions, including 1 090 characters,
  // which is version 23 where jsQR fails at level L but not at M.
  it.each([60, 400, 800, 1000, 1500, 1900])("decodes a link carrying about %i characters of data", (length) => {
    const encoded = encodeSend("text", noise(length, length));
    if (!encoded.ok) throw new Error(`fixture should fit, got ${encoded.size}`);
    const link = sendLink(ORIGIN, "/lab/flash", encoded.fragment);
    const matrix = buildMatrix(link, "M");
    const { data, side } = pixels(matrix.modules, matrix.size);
    const read = jsQR(data, side, side);
    expect(read?.data).toBe(link);
    expect(decodeSend(new URL(read!.data).hash)).toEqual({ kind: "text", data: noise(length, length) });
  });

  it("still fits a QR code with the longest allowed fragment and a long origin", () => {
    const base = "https://a-rather-long-domain-name.example.org";
    // Grow the payload until the fragment sits just under the cap.
    let size = 3000;
    let encoded = encodeSend("text", noise(size, 3));
    while (!encoded.ok && size > 100) {
      size -= 5;
      encoded = encodeSend("text", noise(size, 3));
    }
    if (!encoded.ok) throw new Error("no fixture fits");
    expect(encoded.size).toBeLessThanOrEqual(MAX_FRAGMENT_CHARS);
    expect(encoded.size).toBeGreaterThan(MAX_FRAGMENT_CHARS - 100);
    expect(() => buildMatrix(sendLink(base, "/some/deep/path/flash", encoded.fragment), "M")).not.toThrow();
  });
});
