// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameView } from "@/components/kingsroad/GameView";
import KingsroadApp from "@/components/kingsroad/KingsroadApp";
import { KINGSROAD_TEXT } from "@/lib/kingsroad/i18n";
import { createGame, callWave, STEP } from "@/lib/kingsroad/sim/game";
import { mapById } from "@/lib/kingsroad/sim/maps";
import { upcomingWave } from "@/lib/kingsroad/wave-intel";
import { readRun, writeRun } from "@/lib/kingsroad/snapshot";
import { axeViolations, click, mount, press } from "../helpers/dom";
import type { Game } from "@/lib/kingsroad/sim/types";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 0));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  localStorage.clear();
});
afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function field(game = createGame("meadow", 99), lang: "en" | "ru" = "en", initiallyPaused = false) {
  const checkpoint = vi.fn(() => true), onOver = vi.fn();
  const view = await mount(<div className="tower-root kr-root"><GameView
    game={game} text={KINGSROAD_TEXT[lang]} initiallyPaused={initiallyPaused}
    onCheckpoint={checkpoint} onOver={onOver} onSuspend={vi.fn()} storageFailed={false}
  /></div>);
  return { ...view, checkpoint, onOver };
}
function byText(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === text);
  if (!found) throw Error(`Missing button ${text}`);
  return found;
}

describe("KingsRoad wave-preview UI", () => {
  it("shows the first composition before committing to a wave, opens a single paused dialog, and checkpoints without mutations", async () => {
    const game = createGame("meadow", 99), before = JSON.stringify(game);
    const view = await field(game);
    expect(view.container.querySelector(".kr-preview")?.textContent).toContain("Next wave 1");
    expect(view.container.querySelector(".kr-preview")?.textContent).toContain("Footman ×5");
    await click(view.container.querySelector(".kr-preview"));
    expect(view.container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(view.container.querySelector("#kr-intel-title")?.textContent).toBe("Next wave 1");
    expect(view.container.querySelector(".kr-intel-total")?.textContent).toBe("5 enemies");
    expect(view.checkpoint).toHaveBeenCalledWith(game);
    expect(JSON.stringify(game)).toBe(before);
    expect(view.container.querySelector<HTMLButtonElement>(".kr-wave")?.disabled).toBe(true);
    expect(document.activeElement).toBe(view.container.querySelector(".kr-intel-close"));
    await press(view.container.querySelector(".kr-intel-close")!, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(byText(view.container, "Resume"));
    await press(byText(view.container, "Resume"), "Tab");
    expect(document.activeElement).toBe(view.container.querySelector(".kr-intel-close"));
    expect(await axeViolations(view.container)).toEqual([]);
    view.unmount();
  });

  it.each(["en", "ru"] as const)("renders all scheduled counts and tap-accessible traits in %s", async (lang) => {
    const game = { ...createGame("watch", 19), status: "playing" as const, wave: 6 };
    const expected = upcomingWave(game)!, text = KINGSROAD_TEXT[lang];
    const view = await field(game, lang);
    await click(view.container.querySelector(".kr-preview"));
    const rows = [...view.container.querySelectorAll(".kr-intel-roster li")];
    expect(rows.map((row) => ({ kind: row.getAttribute("data-foe"), name: row.querySelector("span")?.textContent, count: row.querySelector("strong")?.textContent }))).toEqual(
      expected.entries.map(({ kind, count }) => ({ kind, name: text.foes[kind].name, count: `×${count}` })),
    );
    expect(view.container.querySelectorAll("details[data-foe]")).toHaveLength(10);
    expect(view.container.querySelector(".kr-intel-body")?.textContent).toContain(text.previewScheduled);
    for (const kind of ["knight", "imp", "healer", "gargoyle", "boss"]) {
      const detail = view.container.querySelector<HTMLDetailsElement>(`details[data-foe="${kind}"]`)!;
      await click(detail.querySelector("summary"));
      expect(detail.open).toBe(true);
      expect(detail.querySelectorAll("li").length).toBeGreaterThan(1);
    }
    await click(view.container.querySelector(".kr-combat-guide summary"));
    expect(view.container.querySelector<HTMLDetailsElement>(".kr-combat-guide")?.open).toBe(true);
    expect(await axeViolations(view.container)).toEqual([]);
    view.unmount();
  });

  it("does not advance waves, timers, RNG or projectiles while inspecting, even across a large frame gap", async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    const game = createGame("meadow", 99);
    callWave(game);
    game.spawns = [];
    game.nextWaveIn = STEP;
    const view = await field(game), before = JSON.stringify(game);
    await click(view.container.querySelector(".kr-preview"));
    await act(async () => frame?.(performance.now() + 60_000));
    await press(view.container.querySelector("canvas")!, "n");
    expect(JSON.stringify(game)).toBe(before);
    await click(view.container.querySelector(".kr-intel-close"));
    expect(view.container.querySelector("#kr-pause-title")).toBeTruthy();
    await act(async () => frame?.(performance.now() + 60_100));
    expect(JSON.stringify(game)).toBe(before);
    await click(byText(view.container, "Resume"));
    await act(async () => frame?.(performance.now() + 60_200));
    expect(game.wave).toBe(2);
    expect(view.container.querySelector(".kr-preview")?.textContent).toContain("Next wave 3");
    view.unmount();
  });

  it("Escape closes the guide but leaves the run paused, including after visibility/pagehide", async () => {
    const game = createGame("meadow", 99), before = JSON.stringify(game);
    const view = await field(game);
    await click(view.container.querySelector(".kr-preview"));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("pagehide")); });
    await press(view.container.querySelector(".kr-intel-close")!, "Escape");
    expect(view.container.querySelector("#kr-intel-title")).toBeNull();
    expect(view.container.querySelector("#kr-pause-title")).toBeTruthy();
    expect(JSON.stringify(game)).toBe(before);
    view.unmount();
  });

  it("Resume returns to the field without starting the ready wave, then the preview follows a manual wave call", async () => {
    const game = createGame("meadow", 99);
    const view = await field(game);
    await click(view.container.querySelector(".kr-preview"));
    await click(byText(view.container, "Resume"));
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(game.status).toBe("ready");
    expect(document.activeElement).toBe(view.container.querySelector("canvas"));
    await click(byText(view.container, "Start wave 1"));
    expect(game.wave).toBe(1);
    expect(view.container.querySelector(".kr-preview")?.textContent).toContain("Next wave 2");
    view.unmount();
  });

  it("shows a guide instead of a fictitious next wave during the final wave and hides the peek after ending", async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
    const game: Game = { ...createGame("meadow", 99), status: "playing", wave: mapById("meadow").waves };
    const view = await field(game);
    expect(view.container.querySelector(".kr-preview")?.textContent).toContain("No more waves scheduled.");
    await click(view.container.querySelector(".kr-preview"));
    expect(view.container.querySelector("#kr-intel-title")?.textContent).toBe("Enemy guide");
    expect(view.container.querySelector(".kr-intel-roster")).toBeNull();
    expect(view.container.querySelectorAll("details[data-foe]")).toHaveLength(5);
    await click(byText(view.container, "Resume"));
    await act(async () => frame?.(performance.now() + 100));
    expect(game.status).toBe("won");
    expect(view.container.querySelector(".kr-preview")).toBeNull();
    expect(view.onOver).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it("works after Continue Run without changing or rerolling the persisted simulation", async () => {
    const game = { ...createGame("watch", 99), status: "playing" as const, wave: 6 };
    writeRun(game);
    const view = await mount(<KingsroadApp />);
    await click(byText(view.container, "Continue run"));
    await click(view.container.querySelector(".kr-preview"));
    expect(view.container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(view.container.querySelector("#kr-intel-title")?.textContent).toBe("Next wave 7");
    expect(readRun()).toEqual(game);
    await click(view.container.querySelector(".kr-intel-close"));
    await click(byText(view.container, "Save & menu"));
    expect(readRun()).toEqual(game);
    view.unmount();
  });
});
