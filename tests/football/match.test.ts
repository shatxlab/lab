import { describe, expect, it } from "vitest";
import { H, MATCH_SECONDS, W } from "@/lib/football/sim/balance";
import { autoplay, choose, createMatch, shotChance, step, STEP, winner } from "@/lib/football/sim/match";
import { makeSide, strengthOf } from "@/lib/football/sim/squad";
import type { Match } from "@/lib/football/sim/types";

const fresh = (seed: number, human: 0 | 1 | null = null, a = 5, b = 5): Match =>
  createMatch([makeSide(seed, "Reds", 1, a), makeSide(seed + 1, "Blues", 3, b, 100)], seed, human);

describe("squads", () => {
  it("fields eight men in a 1-2-3-2 with stats from 1 to 10", () => {
    const side = makeSide(4, "Reds", 1, 5);
    expect(side.players.map((p) => p.role)).toEqual(["GK", "DF", "DF", "MF", "MF", "MF", "FW", "FW"]);
    for (const p of side.players) for (const value of Object.values(p.stats)) expect(value).toBeGreaterThanOrEqual(1);
    for (const p of side.players) for (const value of Object.values(p.stats)) expect(value).toBeLessThanOrEqual(10);
    expect(new Set(side.players.map((p) => p.name)).size).toBe(8);
  });

  it("is the same squad for the same seed, and a better one for a higher strength", () => {
    expect(makeSide(9, "A", 0, 5)).toEqual(makeSide(9, "A", 0, 5));
    expect(strengthOf(makeSide(9, "A", 0, 8))).toBeGreaterThan(strengthOf(makeSide(9, "A", 0, 3)) + 2);
  });

  it("makes keepers who keep and forwards who shoot", () => {
    const side = makeSide(2, "A", 0, 5);
    expect(side.players[0].stats.keeping).toBeGreaterThan(side.players[6].stats.keeping);
    expect(side.players[6].stats.shooting).toBeGreaterThan(side.players[0].stats.shooting);
  });
});

describe("a match", () => {
  it("replays exactly from its seed", () => {
    const a = fresh(11);
    const b = fresh(11);
    autoplay(a);
    autoplay(b);
    expect(a.score).toEqual(b.score);
    expect(a.events).toEqual(b.events);
  });

  it("runs the full time and then stops", () => {
    const m = fresh(3);
    autoplay(m);
    expect(m.over).toBe(true);
    expect(m.t).toBeGreaterThanOrEqual(MATCH_SECONDS);
    const t = m.t;
    step(m);
    expect(m.t).toBe(t);
    expect(m.events.at(-1)?.kind).toBe("full");
  });

  it("keeps everyone and the ball on the pitch", () => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const m = fresh(seed);
      let stray = 0;
      while (!m.over) {
        if (m.moment) choose(m, null);
        step(m);
        for (const p of m.players) if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) stray += 1;
        if (!Number.isFinite(m.ball.x + m.ball.y)) stray += 1;
      }
      expect(stray).toBe(0);
    }
  });

  it("scores what the events say it scored", () => {
    const m = fresh(5);
    autoplay(m);
    const goals = [0, 0];
    for (const event of m.events) if (event.kind === "goal") goals[event.team] += 1;
    expect(goals).toEqual(m.score);
  });

  it("is a lively game: some goals, plenty of passing", () => {
    let goals = 0;
    let passes = 0;
    let done = 0;
    const n = 20;
    for (let seed = 1; seed <= n; seed += 1) {
      const m = fresh(seed);
      autoplay(m);
      goals += m.score[0] + m.score[1];
      for (const s of m.stats) {
        passes += s.passes;
        done += s.passesDone;
      }
    }
    expect(goals / n).toBeGreaterThan(2);
    expect(goals / n).toBeLessThan(9);
    expect(passes / n).toBeGreaterThan(20);
    expect(done / passes).toBeGreaterThan(0.6);
  });

  it("lets the stronger squad win most of the time, but not always", () => {
    let strong = 0;
    let weak = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const m = fresh(seed, null, 6.5, 4);
      autoplay(m);
      const w = winner(m);
      if (w === 0) strong += 1;
      else if (w === 1) weak += 1;
    }
    expect(strong).toBeGreaterThan(weak * 2);
    expect(weak).toBeGreaterThan(0);
  });
});

describe("moments", () => {
  function untilMoment(m: Match): boolean {
    for (let i = 0; i < 20000 && !m.over; i += 1) {
      step(m);
      if (m.moment) return true;
    }
    return false;
  }

  it("never come up when the bot plays both sides", () => {
    const m = fresh(2, null);
    for (let i = 0; i < 4000; i += 1) step(m);
    expect(m.moment).toBeNull();
  });

  it("pause the game on the player's side, in the attacking part of the pitch", () => {
    const m = fresh(2, 0);
    expect(untilMoment(m)).toBe(true);
    const moment = m.moment!;
    const carrier = m.players[moment.carrier];
    expect(carrier.team).toBe(0);
    expect(carrier.x).toBeGreaterThan(55);
    expect(m.ball.owner).toBe(moment.carrier);
    expect(moment.choices.some((c) => c.kind === "pass")).toBe(true);
    // A run is only on offer while it has a chance.
    for (const c of moment.choices) if (c.kind === "dribble") expect(c.chance).toBeGreaterThanOrEqual(0.1);
    const t = m.t;
    step(m);
    step(m);
    expect(m.t).toBe(t);
  });

  it("go on when the player picks, and not again for a while after a run or a shot", () => {
    const m = fresh(2, 0);
    untilMoment(m);
    const moment = m.moment!;
    const run = moment.choices.findIndex((c) => c.kind === "dribble" || c.kind === "shoot");
    choose(m, run < 0 ? null : run);
    expect(m.moment).toBeNull();
    for (let i = 0; i < 3 / STEP; i += 1) step(m);
    expect(m.moment).toBeNull();
  });

  it("count a pass as a pass, and call the man it lands with straight away", () => {
    let chained = 0;
    let passes = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const m = fresh(seed, 0);
      if (!untilMoment(m)) continue;
      const pass = m.moment!.choices.findIndex((c) => c.kind === "pass" && c.chance >= 0.9);
      if (pass < 0) continue;
      const before = m.stats[0].passes;
      choose(m, pass);
      expect(m.stats[0].passes).toBe(before + 1);
      passes += 1;
      for (let i = 0; i < 4 / STEP && !m.moment; i += 1) step(m);
      if (m.moment && m.players[m.moment.carrier].team === 0) chained += 1;
    }
    expect(passes).toBeGreaterThan(10);
    // The pass lands and the receiver, if he's still up the pitch, gets a call inside four seconds, well before the usual cooldown.
    expect(chained).toBeGreaterThan(passes * 0.25);
  });

  it("let the bot choose when the player doesn't", () => {
    const m = fresh(2, 0);
    untilMoment(m);
    choose(m, null);
    expect(m.moment).toBeNull();
  });

  it("a shot picked in a moment is taken", () => {
    for (let seed = 1; seed < 30; seed += 1) {
      const m = fresh(seed, 0);
      while (untilMoment(m)) {
        const shoot = m.moment!.choices.findIndex((c) => c.kind === "shoot");
        if (shoot < 0) {
          choose(m, null);
          continue;
        }
        const shots = m.stats[0].shots;
        choose(m, shoot);
        expect(m.stats[0].shots).toBe(shots + 1);
        return;
      }
    }
    throw new Error("no moment ever offered a shot");
  });
});

describe("shot odds", () => {
  it("fall with distance and rise with shooting", () => {
    const m = fresh(1);
    const shooter = m.players[6];
    shooter.stats.shooting = 8;
    shooter.x = 90;
    shooter.y = 32;
    const near = shotChance(m, shooter);
    shooter.x = 70;
    const far = shotChance(m, shooter);
    shooter.stats.shooting = 3;
    const poor = shotChance(m, shooter);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(poor);
    expect(near).toBeLessThanOrEqual(1);
    expect(poor).toBeGreaterThanOrEqual(0);
  });

  it("add up to roughly the goals a lot of matches produce", () => {
    let goals = 0;
    let xg = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const m = fresh(seed);
      autoplay(m);
      goals += m.score[0] + m.score[1];
      xg += m.stats[0].xg + m.stats[1].xg;
    }
    expect(xg / goals).toBeGreaterThan(0.7);
    expect(xg / goals).toBeLessThan(1.3);
  });

  it("are forecast by playing each call out, so the odds on the buttons come true", () => {
    // Over many moments, the passes offered at a given forecast should keep the ball about that often.
    let offered = 0;
    let shown = 0;
    let kept = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const m = fresh(seed, 0);
      for (let guard = 0; guard < 6000 && !m.over; guard += 1) {
        step(m);
        if (!m.moment) continue;
        const pass = m.moment.choices.filter((c) => c.kind === "pass" && c.chance < 0.95).sort((a, b) => b.chance - a.chance)[0];
        const index = pass ? m.moment.choices.indexOf(pass) : -1;
        if (!pass || index < 0) {
          choose(m, null);
          continue;
        }
        offered += 1;
        shown += pass.chance;
        choose(m, index);
        for (let i = 0; i < 80 && m.ball.kick !== null; i += 1) step(m);
        if (m.ball.owner !== null && m.players[m.ball.owner].team === 0) kept += 1;
        if (offered >= 90) break;
      }
      if (offered >= 90) break;
    }
    expect(offered).toBeGreaterThan(45);
    expect(Math.abs(kept / offered - shown / offered)).toBeLessThan(0.15);
  }, 60_000);

  it("show what a pass is worth as well as its odds", () => {
    const m = fresh(2, 0);
    for (let i = 0; i < 20000 && !m.moment; i += 1) step(m);
    for (const choice of m.moment!.choices) {
      expect(choice.reward).toBeGreaterThanOrEqual(0);
      expect(choice.reward).toBeLessThanOrEqual(1);
      expect(choice.chance).toBeGreaterThanOrEqual(0);
      expect(choice.chance).toBeLessThanOrEqual(1);
    }
  });
});
