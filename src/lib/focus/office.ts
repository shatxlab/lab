/**
 * The office: a synthetic Software Tycoon game state that the Tycoon scene can
 * draw. The same key always yields the same people — names, faces (a hash of
 * their id) and room colours — and the same order of leaving.
 */

import { seededRandom } from "@/lib/focus/random";
import { OFFICE_THEMES } from "@/lib/tycoon/theme";
import { generateEmployee, ROLES } from "@/lib/tycoon/sim/hiring";
import { createInitialState } from "@/lib/tycoon/sim/state";
import type { Employee, GameState } from "@/lib/tycoon/sim/types";

export const OFFICE_ID = 1;

export interface Office {
  /** What the scene reads. People who leave are removed from `employees`. */
  state: GameState;
  /** Everyone hired, in desk order. */
  roster: Employee[];
  /** Ids in the order they walk out when a Pomodoro is given up. */
  fireOrder: number[];
}

/** An office with `headcount` people, one of whom leaves for every Pomodoro given up. */
export function buildOffice(key: number, headcount: number): Office {
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
  const next = seededRandom(key ^ 0xa5a5a5a5);
  const order = roster.map((person) => person.id);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return { state, roster, fireOrder: order };
}

/** The people still employed once `fired` have left. */
export function staffAfter(office: Office, fired: number): Employee[] {
  const gone = new Set(office.fireOrder.slice(0, fired));
  return office.roster.filter((person) => !gone.has(person.id));
}
