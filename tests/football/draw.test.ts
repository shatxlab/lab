import { describe, expect, it } from "vitest";
import { fitView, MARGIN_X, pickAt, Stage, toWorld } from "@/lib/football/render/draw";
import { W } from "@/lib/football/sim/balance";
import { createMatch, step } from "@/lib/football/sim/match";
import { makeSide } from "@/lib/football/sim/squad";
import type { Match, Moment } from "@/lib/football/sim/types";

const fresh = (seed = 3): Match => createMatch([makeSide(seed, "A", 0, 5), makeSide(seed + 1, "B", 1, 5, 100)], seed, 0);

describe("the view", () => {
  it("fits the whole pitch and its margin, centred", () => {
    const view = fitView(1000, 400);
    expect(toWorld(view, view.ox + (W + MARGIN_X * 2) * view.scale, 0).x).toBeCloseTo(W + MARGIN_X);
    expect(view.ox).toBeGreaterThanOrEqual(0);
    expect(toWorld(view, view.ox, view.oy).x).toBeCloseTo(-MARGIN_X);
  });

  it("draws sprites in whole device pixels", () => {
    for (const ratio of [1, 2, 3]) {
      const view = fitView(844, 330, ratio);
      expect(Number.isInteger(Math.round(view.sprite * ratio * 1000) / 1000)).toBe(true);
      expect(view.sprite * ratio).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("picking a pass", () => {
  it("finds the teammate nearest a tap, and nothing for a tap in empty grass", () => {
    const m = fresh();
    const view = fitView(1000, 700);
    const moment: Moment = {
      carrier: 4,
      choices: [
        { kind: "shoot", chance: 0.2, score: 0.5 },
        { kind: "pass", to: 6, chance: 0.8, score: 0.6 },
        { kind: "pass", to: 7, chance: 0.7, score: 0.5 },
      ],
    };
    const target = m.players[7];
    const px = view.ox + (target.x + MARGIN_X) * view.scale;
    const py = view.oy + (target.y + 6) * view.scale - 10 * view.sprite;
    expect(pickAt(view, m, moment, px, py)).toBe(2);
    expect(pickAt(view, m, moment, -50, -50)).toBeNull();
  });
});

describe("animation", () => {
  it("poses men standing, running, kicking and celebrating from what the sim did", () => {
    const m = fresh(7);
    const stage = new Stage();
    stage.tick(1);
    stage.watch(m, 0.05);
    expect(m.players.every((_, i) => ["stand", "run0", "run1", "run2", "run3"].includes(stage.poseOf(m, i)))).toBe(true);
    const seen = new Set<string>();
    let now = 1;
    for (let i = 0; i < 2400 && !m.over; i += 1) {
      if (m.moment) m.moment = null;
      step(m);
      now += 0.05;
      stage.tick(now);
      stage.watch(m, 0.05);
      for (let p = 0; p < m.players.length; p += 1) seen.add(stage.poseOf(m, p));
    }
    for (const pose of ["stand", "kick", "cheer"]) expect(seen.has(pose)).toBe(true);
    expect([...seen].some((pose) => pose.startsWith("run"))).toBe(true);
  });

  it("holds the sim still for a goal's celebration, then lets go", () => {
    const m = fresh(9);
    const stage = new Stage();
    stage.tick(10);
    stage.celebrate(0, 10, 2);
    expect(stage.celebrating(11)).toBe(0);
    expect(stage.celebrating(12.5)).toBeNull();
  });
});
