import { describe, expect, it } from "vitest";

import { ARENA, LANE_MARGIN } from "@/lib/tower/sim/balance";
import { buildSpawns, isBossWave, laneX, waveDuration, waveRoster } from "@/lib/tower/sim/waves";

const total = (wave: number) => Object.values(waveRoster(wave)).reduce((sum, count) => sum + count, 0);

describe("waveRoster", () => {
  it("opens with grunts only and brings in each enemy on its wave", () => {
    expect(waveRoster(1)).toEqual({ grunt: 4, runner: 0, brute: 0, bat: 0, boss: 0 });
    expect(waveRoster(2).runner).toBeGreaterThan(0);
    expect(waveRoster(3).brute).toBe(0);
    expect(waveRoster(4).brute).toBeGreaterThan(0);
    expect(waveRoster(3).bat).toBe(0);
    expect(waveRoster(4).bat).toBeGreaterThan(0);
  });

  it("sends a boss every fifth wave", () => {
    expect([4, 5, 6, 10].map((wave) => waveRoster(wave).boss)).toEqual([0, 1, 0, 1]);
    expect(isBossWave(10)).toBe(true);
    expect(isBossWave(11)).toBe(false);
  });

  it("never gets smaller", () => {
    for (let wave = 1; wave < 30; wave += 1) {
      if (isBossWave(wave + 1) || isBossWave(wave)) continue;
      expect(total(wave + 1)).toBeGreaterThanOrEqual(total(wave));
    }
  });
});

describe("buildSpawns", () => {
  it("schedules the whole roster in time order inside the wave", () => {
    const spawns = buildSpawns(10, { rng: 42 });
    expect(spawns).toHaveLength(total(10));
    for (let index = 1; index < spawns.length; index += 1) expect(spawns[index].at).toBeGreaterThanOrEqual(spawns[index - 1].at);
    expect(spawns.every((spawn) => spawn.at >= 0 && spawn.at <= waveDuration(10))).toBe(true);
    expect(spawns.find((spawn) => spawn.kind === "boss")?.at).toBe(waveDuration(10) / 2);
  });

  it("is the same for the same seed", () => {
    expect(buildSpawns(7, { rng: 9 })).toEqual(buildSpawns(7, { rng: 9 }));
    expect(buildSpawns(7, { rng: 9 })).not.toEqual(buildSpawns(7, { rng: 10 }));
  });
});

describe("laneX", () => {
  it("stays clear of the side edges", () => {
    const source = { rng: 1 };
    for (let index = 0; index < 200; index += 1) {
      const x = laneX(source);
      expect(x).toBeGreaterThanOrEqual(LANE_MARGIN);
      expect(x).toBeLessThanOrEqual(ARENA.width - LANE_MARGIN);
    }
  });
});
