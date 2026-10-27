import { describe, expect, it } from "vitest";
import {
  ballPixels,
  BALL_SIZE,
  figureFor,
  HAIRCUTS,
  KEEPER_KITS,
  KITS,
  lookFor,
  paintFigure,
  RUN_CYCLE,
  SPRITE_H,
  SPRITE_W,
  type Pose,
} from "@/lib/football/render/sprites";

const POSES: Pose[] = ["stand", ...RUN_CYCLE, "kick", "slide", "dive", "cheer"];
const figure = { haircut: "crop" as const, beard: false, pattern: "plain" as const, keeper: false };

const filled = (grid: Uint8Array): number => grid.reduce((n, token) => n + (token === 0 ? 0 : 1), 0);

describe("figures", () => {
  it("draw every pose on the grid with something in it, outlined", () => {
    for (const pose of POSES) {
      const grid = paintFigure(pose, figure);
      expect(grid.length).toBe(SPRITE_W * SPRITE_H);
      expect(filled(grid)).toBeGreaterThan(80);
      expect(grid.includes(1)).toBe(true);
    }
  });

  it("keep their feet on the ground and their outline inside the grid in every pose", () => {
    for (const pose of POSES) {
      const grid = paintFigure(pose, figure);
      const bottom = grid.slice((SPRITE_H - 1) * SPRITE_W);
      // A keeper in mid-dive is the one figure that's off the ground.
      if (pose !== "dive") expect(bottom.some((token) => token !== 0)).toBe(true);
      // No body pixel sits on the left or right edge, so the outline around it isn't clipped.
      for (let y = 0; y < SPRITE_H; y += 1) {
        expect([0, 1]).toContain(grid[y * SPRITE_W]);
        expect([0, 1]).toContain(grid[y * SPRITE_W + SPRITE_W - 1]);
      }
    }
  });

  it("run with a cycle whose frames differ", () => {
    const frames = RUN_CYCLE.map((pose) => paintFigure(pose, figure).join(""));
    expect(new Set(frames).size).toBe(4);
  });

  it("show every haircut differently", () => {
    const cuts = HAIRCUTS.map((haircut) => paintFigure("stand", { ...figure, haircut }).join(""));
    expect(new Set(cuts).size).toBe(HAIRCUTS.length);
  });
});

describe("looks and kits", () => {
  it("give the same man the same look every time, and different men different looks", () => {
    expect(lookFor(12)).toEqual(lookFor(12));
    const looks = new Set(Array.from({ length: 40 }, (_, id) => JSON.stringify(lookFor(id))));
    expect(looks.size).toBeGreaterThan(15);
  });

  it("colour the shirt with the side's kit and the keeper's own", () => {
    const rgb = (pixels: Uint8ClampedArray, x: number, y: number) => [...pixels.slice((y * SPRITE_W + x) * 4, (y * SPRITE_W + x) * 4 + 3)];
    const torso = (kit: number, role: "FW" | "GK") => rgb(figureFor({ id: 5, role }, kit, "stand"), 8, 12);
    expect(torso(0, "FW")).not.toEqual(torso(1, "FW"));
    expect(torso(0, "GK")).not.toEqual(torso(0, "FW"));
    expect(torso(0, "FW")).toEqual(torso(KITS.length, "FW"));
  });

  it("give a side's neighbours in the list different shirts, and keepers who never match them", () => {
    const shirts = KITS.map((kit) => kit.jersey);
    expect(new Set(shirts).size).toBe(KITS.length);
    for (const keeper of KEEPER_KITS) expect(shirts).not.toContain(keeper.jersey);
  });

  it("have transparent corners and opaque pixels", () => {
    const pixels = figureFor({ id: 1, role: "DF" }, 2, "run1");
    expect(pixels.length).toBe(SPRITE_W * SPRITE_H * 4);
    expect(pixels[3]).toBe(0);
    expect([...pixels].filter((_, i) => i % 4 === 3 && pixels[i] === 255).length).toBeGreaterThan(80);
  });

  it("draw a ball", () => {
    const pixels = ballPixels();
    expect(pixels.length).toBe(BALL_SIZE * BALL_SIZE * 4);
    expect(pixels[(2 * BALL_SIZE + 2) * 4 + 3]).toBe(255);
  });
});
