import { describe, expect, it, vi } from "vitest";

import { drawRun, fitView } from "@/lib/hr/render/draw";
import { DUCK_RADIUS, FOE_HURT_FLASH, MAX_WEAPON_LEVEL, weaponNumbers } from "@/lib/hr/sim/balance";
import { createRun, STEP, step } from "@/lib/hr/sim/run";
import type { Foe, Run } from "@/lib/hr/sim/types";
import { starters } from "@/lib/roster/generate";

const engineer = { ...starters()[0], department: "engineering" as const, quirks: [], stats: { grit: 10, output: 10, hustle: 10, focus: 10, luck: 10 } };
const idle = { dx: 0, dy: 0 };

function scene(level = 1) {
  const run = createRun(engineer, 123);
  const duck = run.weapons[0];
  duck.level = level;
  // The next tick places the first duck exactly to the hero's right.
  duck.spin = -weaponNumbers("rubberDuck", level).speed * STEP;
  return run;
}

function target(run: Run, x: number, y: number, fields: Partial<Foe> = {}): Foe {
  const foe: Foe = {
    id: run.nextId++, kind: "replyAll", boss: false, x, y, radius: 8, hp: 1000, maxHp: 1000,
    speed: 0, touch: 0, xp: 0, gold: 0, pushX: 0, pushY: 0, slow: 0,
    timer: 0, cycles: 0, charge: 0, chargeX: 0, chargeY: 0, duckCooldown: 0, blinkCd: 0, shock: 0, enraged: false, hurt: 0,
    ...fields,
  };
  run.foes.push(foe);
  return foe;
}

function faceRight(run: Run) {
  run.weapons[0].spin = -weaponNumbers("rubberDuck", run.weapons[0].level).speed * STEP;
  step(run, idle);
}

describe("rubber duck contact", () => {
  it.each([1, 3, MAX_WEAPON_LEVEL])("damages contacts at level %i, including hero damage scaling, without knockback", (level) => {
    const run = scene(level);
    run.numbers.damage = 1.5;
    const numbers = weaponNumbers("rubberDuck", level);
    const foe = target(run, run.hero.x + numbers.radius, run.hero.y);
    step(run, idle);
    expect(foe.hp).toBeCloseTo(1000 - numbers.damage * 1.5);
    expect(run.dealt.rubberDuck).toBeCloseTo(numbers.damage * 1.5);
    expect(foe.duckCooldown).toBe(numbers.life);
    expect(foe.hurt).toBe(FOE_HURT_FLASH);
    expect([foe.pushX, foe.pushY]).toEqual([0, 0]);
  });

  it("hits a tangent contact, but not the empty interior or outside of the orbit", () => {
    const run = scene();
    const radius = weaponNumbers("rubberDuck", 1).radius;
    const tangent = target(run, run.hero.x + radius + DUCK_RADIUS + 8, run.hero.y);
    const outside = target(run, run.hero.x, run.hero.y + radius + DUCK_RADIUS + 9);
    const inside = target(run, run.hero.x - 20, run.hero.y);
    step(run, idle);
    expect(tangent.hp).toBe(992);
    expect(outside.hp).toBe(1000);
    expect(inside.hp).toBe(1000);
  });

  it("uses a per-enemy cooldown rather than damaging on every contact tick", () => {
    const run = scene();
    const { radius, life, damage } = weaponNumbers("rubberDuck", 1);
    const foe = target(run, run.hero.x + radius, run.hero.y);
    faceRight(run);
    for (let tick = 0; tick < Math.floor(life / STEP) - 1; tick += 1) faceRight(run);
    expect(foe.hp).toBe(1000 - damage);
    // Allow one extra fixed tick for floating-point expiry at the boundary.
    faceRight(run);
    faceRight(run);
    expect(foe.hp).toBe(1000 - damage * 2);
  });

  it("lets different orbiters hit different enemies in the same tick", () => {
    const run = scene(2);
    const { radius, damage } = weaponNumbers("rubberDuck", 2);
    const a = target(run, run.hero.x + radius, run.hero.y);
    const b = target(run, run.hero.x - radius, run.hero.y);
    step(run, idle);
    expect(a.hp).toBe(1000 - damage);
    expect(b.hp).toBe(1000 - damage);
    expect(run.dealt.rubberDuck).toBe(damage * 2);
  });

  it("shares each enemy's cooldown across all orbiters", () => {
    const run = scene(MAX_WEAPON_LEVEL);
    const { radius, damage } = weaponNumbers("rubberDuck", MAX_WEAPON_LEVEL);
    // A large stationary boss overlaps every orbiter at once.
    const boss = target(run, run.hero.x, run.hero.y, { kind: "auditor", radius: radius + DUCK_RADIUS, timer: 100 });
    step(run, idle);
    expect(boss.hp).toBe(1000 - damage);
    expect(run.dealt.rubberDuck).toBe(damage);
  });

  it("can kill and credit damage without counting overkill", () => {
    const run = scene();
    const radius = weaponNumbers("rubberDuck", 1).radius;
    target(run, run.hero.x + radius, run.hero.y, { hp: 3 });
    step(run, idle);
    expect(run.foes).toHaveLength(0);
    expect(run.kills).toBe(1);
    expect(run.dealt.rubberDuck).toBe(3);
  });

  it("flashes only on actual hits, and limits dense-pack feedback to one flash per duck", () => {
    const run = scene();
    const radius = weaponNumbers("rubberDuck", 1).radius;
    for (let index = 0; index < 8; index += 1) {
      target(run, run.hero.x + radius, run.hero.y, { kind: "printerJam", timer: 100 });
    }
    step(run, idle);
    expect(run.dealt.rubberDuck).toBe(8 * 8);
    const flashes = run.effects.filter((effect) => effect.kind === "duckHit");
    expect(flashes).toHaveLength(1);
    expect(flashes[0]).toMatchObject({ x: run.hero.x + radius, y: run.hero.y, age: 0, life: 0.18 });
    faceRight(run); // Contacts remain, but their cooldown prevents another hit/flash.
    expect(run.effects.filter((effect) => effect.kind === "duckHit")).toHaveLength(1);
    run.weapons = [];
    for (let tick = 0; tick < 12; tick += 1) step(run, idle);
    expect(run.effects.filter((effect) => effect.kind === "duckHit")).toEqual([]);
  });

  it("does not flash for empty space or foes already killed by another weapon", () => {
    const empty = scene();
    step(empty, idle);
    expect(empty.effects).toEqual([]);
    const dead = scene();
    target(dead, dead.hero.x + weaponNumbers("rubberDuck", 1).radius, dead.hero.y, { hp: 0 });
    step(dead, idle);
    expect(dead.dealt.rubberDuck).toBeUndefined();
    expect(dead.effects.filter((effect) => effect.kind === "duckHit")).toEqual([]);
  });

  it("continues identically after JSON suspend/resume", () => {
    const run = scene(3);
    target(run, run.hero.x + weaponNumbers("rubberDuck", 3).radius, run.hero.y);
    step(run, idle);
    const copy = JSON.parse(JSON.stringify(run)) as Run;
    for (let tick = 0; tick < 120; tick += 1) {
      step(run, idle);
      step(copy, idle);
    }
    expect(copy).toEqual(run);
    expect(run.dealt.rubberDuck).toBeGreaterThan(0);
  });
});

describe("duck render/collision alignment", () => {
  it.each([1, 3, MAX_WEAPON_LEVEL])("draws level %i ducks at the same contact positions used by the sim", (level) => {
    const run = scene(level);
    const { radius, count, damage } = weaponNumbers("rubberDuck", level);
    const foes = Array.from({ length: count }, (_, index) => {
      const angle = index / count * Math.PI * 2;
      return target(run, run.hero.x + Math.cos(angle) * radius, run.hero.y + Math.sin(angle) * radius);
    });
    step(run, idle);
    const circles: { x: number; y: number; radius: number; color: string }[] = [];
    const state: Record<string, unknown> = {};
    const ctx = new Proxy(state, {
      get: (object, key: string) => object[key] ?? (() => undefined),
    }) as unknown as CanvasRenderingContext2D;
    ctx.arc = vi.fn((x, y, radius) => { circles.push({ x, y, radius, color: ctx.fillStyle as string }); });
    const strokes: string[] = [];
    ctx.stroke = vi.fn(() => { strokes.push(ctx.strokeStyle as string); });
    ctx.lineTo = vi.fn();
    drawRun(ctx, run, fitView(390, 780), { frames: null, department: "engineering", moving: false, stick: null }, 0);
    const bodies = circles.filter((circle) => circle.color === "#ffcd2a" && circle.radius === DUCK_RADIUS);
    expect(bodies).toHaveLength(count);
    expect(strokes.filter((color) => color === "rgba(255, 205, 42, 1)")).toHaveLength(count);
    // Each contact ring has four rays, in addition to the ordinary scene geometry.
    expect(ctx.lineTo).toHaveBeenCalled();
    foes.forEach((foe, index) => {
      expect(foe.hp).toBe(1000 - damage);
      expect(bodies[index].x).toBeCloseTo(foe.x);
      expect(bodies[index].y).toBeCloseTo(foe.y);
    });
  });
});
