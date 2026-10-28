import { describe, expect, it } from "vitest";

import { rosterAppearance } from "@/lib/roster/appearance";
import { DEPARTMENTS } from "@/lib/roster/data";
import { DEPARTMENT_IDS } from "@/lib/roster/types";
import { appearanceFor, SHIRT_RAMPS } from "@/lib/tycoon/render-support/characters";

describe("rosterAppearance", () => {
  it("takes the face from the id and the shirt from the department", () => {
    for (let id = 1; id <= 50; id += 1) {
      const look = rosterAppearance(id, "finance");
      expect(look.character).toBe(appearanceFor(id).character);
      expect(look.hair).toBe(appearanceFor(id).hair);
      expect(SHIRT_RAMPS[look.shirt - 1]?.name).toBe(DEPARTMENTS.finance.shirt);
    }
  });

  it("gives every department its own shirt", () => {
    const shirts = DEPARTMENT_IDS.map((department) => rosterAppearance(1, department).shirt);
    expect(shirts.every((shirt) => shirt > 0)).toBe(true);
    expect(new Set(shirts).size).toBe(DEPARTMENT_IDS.length);
  });
});
