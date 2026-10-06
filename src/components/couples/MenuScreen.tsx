import type { CSSProperties } from "react";

import { GAMES } from "@/lib/couples/themes";
import { stringsFor, t } from "@/lib/couples/i18n";
import type { CouplesStats } from "@/lib/couples/storage";
import type { GameId, Lang } from "@/lib/couples/types";

interface MenuScreenProps {
  lang: Lang;
  stats: CouplesStats;
  onPick(game: GameId): void;
}

function statsLine(lang: Lang, stats: CouplesStats): string | null {
  if (stats.games <= 0) return null;
  const percent = stats.cards > 0 ? Math.round((stats.matches / stats.cards) * 100) : 0;
  return t(lang, "statsLine", { games: stats.games, cards: stats.cards, percent });
}

export function MenuScreen({ lang, stats, onPick }: MenuScreenProps) {
  const TXT = stringsFor(lang);
  const line = statsLine(lang, stats);
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
            <span className="cp-game-name">{game.name[lang]}</span>
            <span className="cp-game-tagline">{game.tagline[lang]}</span>
            <span className="cp-game-desc">{game.description[lang]}</span>
            <span className="cp-game-cta">{TXT.open} →</span>
          </button>
        ))}
      </div>

      {line ? <p className="cp-stats-line">{line}</p> : null}
    </div>
  );
}
