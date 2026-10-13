/**
 * The day's office: a synthetic Software Tycoon game state that the Tycoon
 * scene can draw. The same key always yields the same people — names, faces
 * (a hash of their id) and room colours — and the same order of leaving.
 */

import { OFFICE_THEMES } from "@/lib/tycoon/theme";
import { generateEmployee, ROLES } from "@/lib/tycoon/sim/hiring";
import { createInitialState } from "@/lib/tycoon/sim/state";
import type { Employee, GameState } from "@/lib/tycoon/sim/types";

export const OFFICE_ID = 1;

export interface DayOffice {
  /** What the scene reads. People who leave are removed from `employees`. */
  state: GameState;
  /** Everyone hired for the day, in desk order. */
  roster: Employee[];
  /** Ids in the order they walk out when a Pomodoro is missed. */
  fireOrder: number[];
}

/** mulberry32 over a 32-bit seed. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix the user's seed, the calendar day and a run counter into one office key. */
export function officeKey(seed: number, day: number, run = 0): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (day + 0x7f4a7c15), 0xc2b2ae35) >>> 0;
  h = Math.imul(h ^ (run * 0x27d4eb2f + 1), 0x165667b1) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** One person per Pomodoro in the day's quota. */
export function buildOffice(key: number, headcount: number): DayOffice {
  const state = createInitialState(key);
  state.employees = [];
  // Faces come from the id, so each office starts its ids somewhere else.
  state.nextId = ((key >>> 4) % 900_000) + 10;
  state.offices = [{ id: OFFICE_ID, kind: "office", theme: key % OFFICE_THEMES.length, project: null }];
  state.nextId += 1;
  for (let i = 0; i < headcount; i += 1) {
    state.employees.push({ ...generateEmployee(state, ROLES[i % ROLES.length]!), officeId: OFFICE_ID });
  }
  const roster = [...state.employees];

  // Seeded shuffle (Fisher–Yates) for who goes first.
  const next = random(key ^ 0xa5a5a5a5);
  const order = roster.map((person) => person.id);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return { state, roster, fireOrder: order };
}

/** The people still employed once `fired` have left. */
export function staffAfter(office: DayOffice, fired: number): Employee[] {
  const gone = new Set(office.fireOrder.slice(0, fired));
  return office.roster.filter((person) => !gone.has(person.id));
}
