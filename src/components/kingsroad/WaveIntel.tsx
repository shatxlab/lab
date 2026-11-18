import { BookOpen, X } from "lucide-react";

import type { KingsroadText } from "@/lib/kingsroad/i18n";
import type { MapDef } from "@/lib/kingsroad/sim/maps";
import { combatDetails, foeDetails, guideKinds, type WaveIntel } from "@/lib/kingsroad/wave-intel";

/** A compact, always-visible peek. The full roster and guide open by tap, never hover. */
export function WavePreview({ intel, text, onInspect }: { intel: WaveIntel | null; text: KingsroadText; onInspect: () => void }) {
  return (
    <button type="button" className="kr-preview" onClick={onInspect} aria-haspopup="dialog">
      <span className="kr-preview-heading">
        <strong>{intel ? text.wavePreview(intel.wave) : text.enemyGuide}</strong>
        {intel && <span>{text.previewTotal(intel.total)}</span>}
        <span className="kr-preview-link"><BookOpen size={16} aria-hidden="true" />{text.previewDetails}</span>
      </span>
      <span className="kr-preview-roster">
        {intel ? intel.entries.map(({ kind, count }) => `${text.foes[kind].name} ×${count}`).join(" · ") : text.noUpcomingWave}
      </span>
    </button>
  );
}

/** Inspection pauses the game. Close leaves it paused; only the explicit Resume action continues it. */
export function WaveIntelPanel({ intel, map, text, onClose, onResume }: {
  intel: WaveIntel | null;
  map: MapDef;
  text: KingsroadText;
  onClose: () => void;
  onResume: () => void;
}) {
  return (
    <div
      className="tower-overlay kr-intel-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kr-intel-title"
      aria-describedby="kr-intel-paused"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key === "Tab") {
          // The guide contains only buttons and native disclosures; keep modal keyboard focus inside it.
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, summary")];
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}
    >
      <div className="tower-panel kr-intel-panel">
        <div className="kr-intel-header">
          <h2 id="kr-intel-title">{intel ? text.wavePreview(intel.wave) : text.enemyGuide}</h2>
          <button type="button" className="kr-intel-close" onClick={onClose} aria-label={text.close} autoFocus>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p id="kr-intel-paused" className="kr-intel-hint">{text.previewPaused}</p>
        <div className="kr-intel-body">
          {intel ? (
            <section aria-label={text.wavePreview(intel.wave)}>
              <p className="kr-intel-total">{text.previewTotal(intel.total)}</p>
              <ul className="kr-intel-roster">
                {intel.entries.map(({ kind, count }) => (
                  <li key={kind} data-foe={kind}>
                    <span>{text.foes[kind].name}</span><strong>×{count}</strong>
                  </li>
                ))}
              </ul>
              <p className="kr-intel-hint">{text.previewScheduled}</p>
            </section>
          ) : <p>{text.noUpcomingWave}</p>}
          <section aria-labelledby="kr-guide-title">
            <h3 id="kr-guide-title">{text.enemyGuide}</h3>
            <p className="kr-intel-hint">{text.guideHint}</p>
            {guideKinds(map).map((kind) => (
              <details className="kr-foe-guide" key={kind} data-foe={kind}>
                <summary>{text.foes[kind].name}</summary>
                <ul>{foeDetails(kind, text).map((line) => <li key={line}>{line}</li>)}</ul>
              </details>
            ))}
            <details className="kr-foe-guide kr-combat-guide">
              <summary>{text.combatRules}</summary>
              <ul>{combatDetails(text).map((line) => <li key={line}>{line}</li>)}</ul>
            </details>
          </section>
        </div>
        <div className="tower-actions kr-intel-actions">
          <button type="button" className="tower-button" onClick={onResume}>{text.resume}</button>
        </div>
      </div>
    </div>
  );
}
