import { describe, expect, it } from "vitest";

import { statChange, TOWER_TEXT } from "@/lib/tower/i18n";
import { towerStats } from "@/lib/tower/sim/stats";
import { emptyPerks, emptyUpgrades } from "@/lib/tower/sim/upgrades";

function withCaltrops(level: number) {
  return towerStats({ ...emptyUpgrades(), caltrops: level }, emptyPerks());
}

describe("statChange", () => {
  it("shows each number before and after, or once when it doesn't move", () => {
    expect(statChange([["Slow", "25%"], ["Lasts", "6 s"]], [["Slow", "35%"], ["Lasts", "6 s"]])).toBe("Slow 25% → 35% · Lasts 6 s");
  });
});

describe("upgrade cards", () => {
  it("say how much more each caltrops level slows, and for how long", () => {
    const { caltrops } = TOWER_TEXT.en.upgradeStats;
    expect(statChange(caltrops(withCaltrops(1)), caltrops(withCaltrops(1)))).toBe("Slow 25% · Lasts 6 s");
    expect(statChange(caltrops(withCaltrops(1)), caltrops(withCaltrops(2)))).toBe("Slow 25% → 35% · Lasts 6 s → 9 s");
    expect(statChange(TOWER_TEXT.ru.upgradeStats.caltrops(withCaltrops(2)), TOWER_TEXT.ru.upgradeStats.caltrops(withCaltrops(3)))).toBe(
      "Замедление 35% → 45% · Держатся 9 с → 12 с",
    );
  });
});

describe("perk cards", () => {
  it("show the perk's running total", () => {
    const stats = (fletching: number) => towerStats(emptyUpgrades(), { ...emptyPerks(), fletching });
    const { fletching } = TOWER_TEXT.en.perkStats;
    expect(statChange(fletching(stats(2), 2), fletching(stats(3), 3))).toBe("Damage +16% → +24%");
  });
});
