import { describe, expect, it } from "vitest";
import { AIM_RANGE, aimAt, aimZones, STEP } from "@/lib/football/sim/balance";
import { choose, createMatch, keeperCover, step } from "@/lib/football/sim/match";
import { makeSide } from "@/lib/football/sim/squad";
import type { Match } from "@/lib/football/sim/types";

const fresh = (seed: number): Match => createMatch([makeSide(seed, "A", 0, 5), makeSide(seed + 1, "B", 1, 5, 100)], seed, 0);

/** The match at its first moment with a shot on offer, or null. Deterministic: the same seed gives the same moment. */
function untilShot(seed: number): { m: Match; shoot: number } | null {
  const m = fresh(seed);
  for (let i = 0; i < 6000 && !m.over; i += 1) {
    step(m);
    if (!m.moment) continue;
    const shoot = m.moment.choices.findIndex((c) => c.kind === "shoot");
    if (shoot >= 0) return { m, shoot };
    choose(m, null);
  }
  return null;
}

/** Goals from taking that shot with that aim, on a fresh replay of the match. */
function goalFrom(seed: number, aim: number): boolean {
  const found = untilShot(seed);
  if (!found) return false;
  const before = found.m.score[0];
  choose(found.m, found.shoot, aim);
  for (let i = 0; i < 4 / STEP; i += 1) step(found.m);
  return found.m.score[0] > before;
}

describe("the aim", () => {
  it("sweeps from one end to the other", () => {
    const samples = Array.from({ length: 200 }, (_, i) => aimAt(i * 0.01));
    expect(Math.max(...samples)).toBeCloseTo(AIM_RANGE, 1);
    expect(Math.min(...samples)).toBeCloseTo(-AIM_RANGE, 1);
    expect(aimAt(0)).toBe(0);
  });

  it("draws the keeper where he stands: red on him, amber by him, green away, grey past the posts, with no gaps", () => {
    for (const centre of [-0.8, -0.2, 0, 0.5, 0.95, 2]) {
      const zones = aimZones(centre, 0.5);
      expect(zones[0].from).toBe(-AIM_RANGE);
      expect(zones.at(-1)?.to).toBe(AIM_RANGE);
      zones.slice(1).forEach((zone, index) => expect(zone.from).toBeCloseTo(zones[index].to, 9));
      zones.forEach((zone) => {
        const mid = (zone.from + zone.to) / 2;
        if (Math.abs(mid) > 1) expect(zone.tone).toBe("wide");
        else if (Math.abs(mid - centre) <= 0.5) expect(zone.tone).toBe("covered");
        else if (Math.abs(mid - centre) > 0.9) expect(zone.tone).toBe("open");
      });
    }
    const zones = aimZones(0, 0.5);
    expect(zones.map((zone) => zone.tone)).toEqual(["wide", "open", "near", "covered", "near", "open", "wide"]);
  });

  it("puts the keeper's cover where he stands", () => {
    const found = untilShot(3)!;
    const keeper = found.m.players.find((p) => p.team === 1 && p.role === "GK")!;
    const cover = keeperCover(found.m, found.m.moment!.carrier);
    expect(cover.centre).toBeCloseTo((keeper.y - 32) / 6, 6);
    expect(cover.half).toBeGreaterThanOrEqual(0.3);
    expect(cover.half).toBeLessThanOrEqual(0.6);
  });

  it("is worth getting right: shots away from the keeper score far more than shots at him, and aimed past the post almost nothing does", () => {
    let atKeeper = 0;
    let awayFromKeeper = 0;
    let wide = 0;
    let shots = 0;
    for (let seed = 1; seed <= 160 && shots < 60; seed += 1) {
      const found = untilShot(seed);
      if (!found) continue;
      const { centre } = keeperCover(found.m, found.m.moment!.carrier);
      shots += 1;
      // As far from him as the goal allows, inside the posts.
      const away = centre > 0 ? Math.max(-0.9, centre - 1) : Math.min(0.9, centre + 1);
      if (goalFrom(seed, Math.max(-0.9, Math.min(0.9, centre)))) atKeeper += 1;
      if (goalFrom(seed, away)) awayFromKeeper += 1;
      if (goalFrom(seed, 1.4)) wide += 1;
    }
    expect(shots).toBeGreaterThan(45);
    expect(awayFromKeeper).toBeGreaterThan(atKeeper * 1.8);
    expect(wide).toBeLessThanOrEqual(Math.max(1, Math.floor(shots * 0.12)));
  }, 60_000);

  it("is replayable: the same moment, the same aim, the same result", () => {
    const found = untilShot(4);
    expect(found).not.toBeNull();
    expect(goalFrom(4, 0.7)).toBe(goalFrom(4, 0.7));
  });
});
