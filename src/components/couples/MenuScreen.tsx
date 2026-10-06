import type { CSSProperties } from "react";

import { GAMES } from "@/lib/couples/themes";
import { TXT } from "@/lib/couples/i18n";
import type { CouplesStats } from "@/lib/couples/storage";
import type { GameId } from "@/lib/couples/types";

interface MenuScreenProps {
  stats: CouplesStats;
  onPick(game: GameId): void;
}

function statsLine(stats: CouplesStats): string | null {
  if (stats.games <= 0) return null;
  const percent = stats.cards > 0 ? Math.round((stats.matches / stats.cards) * 100) : 0;
  return `Игр сыграно: ${stats.games} · Карточек: ${stats.cards} · Совпадений: ${percent}%`;
}

export function MenuScreen({ stats, onPick }: MenuScreenProps) {
  const line = statsLine(stats);
  return (
    <div className="cp-menu">
      <header className="cp-hero">
        <p className="cp-eyebrow">{TXT.appName}</p>
        <h1>{TXT.tagline}</h1>
        <p className="cp-note">{TXT.menuSubtitle}</p>
      </header>

      <div className="cp-game-grid">
        {GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            className="cp-game-card"
            style={{ background: game.gradient, "--game-accent": game.accent } as CSSProperties}
            onClick={() => onPick(game.id)}
          >
            <span className="cp-game-emoji" aria-hidden="true">
              {game.emoji}
            </span>
            <span className="cp-game-name">{game.name}</span>
            <span className="cp-game-tagline">{game.tagline}</span>
            <span className="cp-game-desc">{game.description}</span>
            <span className="cp-game-cta">{TXT.open} →</span>
          </button>
        ))}
      </div>

      {line ? <p className="cp-stats-line">{line}</p> : null}
    </div>
  );
}
