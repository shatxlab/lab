import { describe, expect, it } from "vitest";

import { OFFICE_ID, buildOffice, officeKey, staffAfter } from "@/lib/focus/office";
import { appearanceFor } from "@/lib/tycoon/render-support/characters";

describe("officeKey", () => {
  it("is deterministic and differs by seed, day and run", () => {
    expect(officeKey(7, 20_000, 0)).toBe(officeKey(7, 20_000, 0));
    const keys = new Set([officeKey(7, 20_000, 0), officeKey(8, 20_000, 0), officeKey(7, 20_001, 0), officeKey(7, 20_000, 1)]);
    expect(keys.size).toBe(4);
  });
});

describe("buildOffice", () => {
  it("makes the same people from the same key", () => {
    const a = buildOffice(12345, 7);
    const b = buildOffice(12345, 7);
    expect(a.roster.map((p) => [p.id, p.name, p.role])).toEqual(b.roster.map((p) => [p.id, p.name, p.role]));
    expect(a.fireOrder).toEqual(b.fireOrder);
    expect(a.state.offices[0]!.theme).toBe(b.state.offices[0]!.theme);
  });

  it("makes different people on different days", () => {
    const a = buildOffice(officeKey(1, 100), 6);
    const b = buildOffice(officeKey(1, 101), 6);
    expect(a.roster.map((p) => p.name)).not.toEqual(b.roster.map((p) => p.name));
    const faces = (office: ReturnType<typeof buildOffice>) => office.roster.map((p) => JSON.stringify(appearanceFor(p.id)));
    expect(faces(a)).not.toEqual(faces(b));
  });

  it("seats one person per Pomodoro, all in the one office, with unique ids", () => {
    const office = buildOffice(99, 9);
    expect(office.roster).toHaveLength(9);
    expect(office.state.employees).toHaveLength(9);
    expect(new Set(office.roster.map((p) => p.id)).size).toBe(9);
    expect(office.roster.every((p) => p.officeId === OFFICE_ID)).toBe(true);
    expect(office.state.offices).toHaveLength(1);
    expect(office.state.offices[0]).toMatchObject({ id: OFFICE_ID, kind: "office", project: null });
    expect(office.state.offices[0]!.theme).toBeGreaterThanOrEqual(0);
    expect(office.state.offices[0]!.theme).toBeLessThan(4);
  });

  it("names everyone and gives them the full Employee shape the scene reads", () => {
    for (const person of buildOffice(5, 4).roster) {
      expect(person.name).toMatch(/\S+ \S+/);
      expect(person.training).toBeNull();
      expect(person.morale).toBeGreaterThan(0);
    }
  });

  it("orders the walkouts as a permutation of the roster", () => {
    const office = buildOffice(2024, 8);
    expect([...office.fireOrder].sort((a, b) => a - b)).toEqual(office.roster.map((p) => p.id).sort((a, b) => a - b));
  });

  it("handles an office of one", () => {
    const office = buildOffice(1, 1);
    expect(office.roster).toHaveLength(1);
    expect(staffAfter(office, 1)).toEqual([]);
  });
});

describe("staffAfter", () => {
  it("removes people in the fire order and keeps desk order for the rest", () => {
    const office = buildOffice(31337, 6);
    expect(staffAfter(office, 0)).toEqual(office.roster);
    const left = staffAfter(office, 2);
    expect(left).toHaveLength(4);
    expect(left.map((p) => p.id)).not.toContain(office.fireOrder[0]);
    expect(left.map((p) => p.id)).not.toContain(office.fireOrder[1]);
    expect(left.map((p) => p.id)).toEqual(office.roster.map((p) => p.id).filter((id) => !office.fireOrder.slice(0, 2).includes(id)));
    expect(staffAfter(office, 99)).toEqual([]);
  });
});
