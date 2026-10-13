import * as React from "react";

import type { AppLang } from "@/lib/apps/lang";
import { tz } from "@/lib/focus/i18n";
import { staffAfter, type Office } from "@/lib/focus/office";
import type { Employee } from "@/lib/tycoon/sim/types";
import { cn } from "@/lib/viewer/utils";

export interface FocusSceneProps {
  lang: AppLang;
  office: Office;
  /** How many people have left so far; when it grows, the next person walks out. */
  fired: number;
  /** Are people typing right now? */
  working: boolean;
  /** The text on the plate over the doors. */
  label: string;
  onSelect: (person: Employee) => void;
  className?: string;
}

type SceneHandle = { leave: (id: number) => void };

/**
 * The office, drawn by Software Tycoon's Pixi scene. Pixi loads here, on demand,
 * so it never enters the island's first chunk. If it cannot start (no WebGL),
 * a plain list of the team stands in and the timer carries on regardless.
 */
export function FocusScene({ lang, office, fired, working, label, onSelect, className }: FocusSceneProps) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const sceneRef = React.useRef<SceneHandle | null>(null);
  const [failed, setFailed] = React.useState(false);

  // Read through a ref so the long-lived scene always sees the latest values.
  const live = React.useRef({ working, label, onSelect });
  live.current = { working, label, onSelect };
  const shownFired = React.useRef(fired);
  const firedNow = React.useRef(fired);
  firedNow.current = fired;

  React.useEffect(() => {
    // Whoever has already left is not drawn; no animation for a reload.
    office.state.employees = staffAfter(office, firedNow.current);
    shownFired.current = firedNow.current;
    setFailed(false);

    const host = hostRef.current;
    if (!host) return;
    let destroyed = false;
    let dispose: (() => void) | null = null;

    void (async () => {
      try {
        // 'pixi.js/unsafe-eval' swaps pixi's runtime-compiled shader helpers for precompiled ones:
        // the site CSP forbids unsafe-eval, and without it the renderer throws.
        const [{ Application }, { loadAtlas }, { OfficeScene }] = await Promise.all([
          import("pixi.js"),
          import("@/lib/tycoon/render/atlas"),
          import("@/lib/tycoon/render/OfficeScene"),
          import("pixi.js/unsafe-eval"),
        ]);
        if (destroyed) return;
        const app = new Application();
        await app.init({
          width: Math.max(1, host.clientWidth),
          height: Math.max(1, host.clientHeight),
          background: "#14141f",
          antialias: false,
          autoDensity: true,
          resolution: window.devicePixelRatio,
          roundPixels: true,
        });
        if (destroyed) {
          void app.destroy(true, { children: true });
          return;
        }
        host.appendChild(app.canvas);
        const atlas = await loadAtlas();
        if (destroyed) {
          void app.destroy(true, { children: true });
          return;
        }

        const scene = new OfficeScene(
          app,
          atlas,
          () => office.state,
          () => office.state.offices[0]!.id,
          (id) => {
            const person = office.roster.find((candidate) => candidate.id === id);
            if (person) live.current.onSelect(person);
          },
          { label: () => live.current.label, working: () => live.current.working },
        );
        app.stage.addChild(scene.view, scene.popups);
        sceneRef.current = scene;

        const layout = () => scene.layout(app.screen.width, app.screen.height);
        app.renderer.on("resize", layout);
        const observer = new ResizeObserver(() => app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)));
        observer.observe(host);
        layout();
        app.ticker.add((ticker) => scene.update(ticker.deltaMS, 1));

        dispose = () => {
          observer.disconnect();
          sceneRef.current = null;
          void app.destroy(true, { children: true });
        };
      } catch {
        if (!destroyed) setFailed(true);
      }
    })();

    return () => {
      destroyed = true;
      dispose?.();
    };
  }, [office]);

  // A missed Pomodoro: the next person in the office's seeded order walks out.
  React.useEffect(() => {
    if (fired <= shownFired.current) return;
    for (const id of office.fireOrder.slice(shownFired.current, fired)) {
      sceneRef.current?.leave(id);
      office.state.employees = office.state.employees.filter((person) => person.id !== id);
    }
    shownFired.current = fired;
  }, [fired, office]);

  if (failed) {
    const team = staffAfter(office, fired);
    return (
      <div className={cn("rounded-xl border border-(--border) bg-(--surface) p-4", className)}>
        <p className="text-sm text-(--muted-fg)">{tz(lang, "sceneFailed")}</p>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {team.map((person) => (
            <li key={person.id} className="rounded-full border border-(--border) px-3 py-1">
              {person.name}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={`${tz(lang, "team")}: ${staffAfter(office, fired).map((person) => person.name).join(", ")}`}
      className={cn("relative w-full overflow-hidden rounded-xl border border-(--border) bg-[#14141f] [&>canvas]:block", className)}
    />
  );
}
