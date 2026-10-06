import { Check } from "lucide-react";
import type { CSSProperties } from "react";

import { t } from "@/lib/alias/i18n";
import type { Lang, Team, ThemeDef } from "@/lib/alias/types";

function locale(lang: Lang): string {
  return lang === "ru" ? "ru-RU" : "en-US";
}

interface ThemeCardProps {
  theme: ThemeDef;
  lang: Lang;
  selected: boolean;
  count: number;
  onSelect: () => void;
}

export function ThemeCard({ theme, lang, selected, count, onSelect }: ThemeCardProps) {
  const style = {
    background: theme.gradient,
    "--theme-accent": theme.accent,
  } as CSSProperties;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-theme-id={theme.id}
      className={`alias-theme-card${selected ? " is-selected" : ""}`}
      style={style}
    >
      <span className="alias-theme-emoji" aria-hidden="true">
        {theme.emoji}
      </span>
      <span className="alias-theme-name">{theme.name[lang]}</span>
      <span className="alias-theme-tagline">{theme.tagline[lang]}</span>
      <span className="alias-theme-count">
        {count.toLocaleString(locale(lang))} {t(lang, "wordsInDeck")}
      </span>
      {selected ? (
        <span className="alias-theme-check" aria-hidden="true">
          <Check strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}

interface TimerRingProps {
  remaining: number;
  total: number;
  urgent: boolean;
}

export function TimerRing({ remaining, total, urgent }: TimerRingProps) {
  const safeTotal = Math.max(1, total);
  const fraction = Math.max(0, Math.min(1, remaining / safeTotal));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const seconds = Math.max(0, Math.ceil(remaining));
  return (
    <div
      className={`alias-timer${urgent ? " is-urgent" : ""}`}
      role="timer"
      aria-label={`${seconds}`}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="alias-timer-track" cx="50" cy="50" r={radius} />
        <circle
          className="alias-timer-value"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="alias-timer-number">{seconds}</span>
    </div>
  );
}

interface ScoreboardProps {
  teams: readonly Team[];
  activeTeamId?: string | null;
}

export function Scoreboard({ teams, activeTeamId }: ScoreboardProps) {
  return (
    <ul className="alias-scoreboard">
      {teams.map((team) => {
        const active = team.id === activeTeamId;
        return (
          <li
            key={team.id}
            className={`alias-score-row${active ? " is-active" : ""}`}
            style={{ "--team-color": team.color } as CSSProperties}
          >
            <span className="alias-score-dot" aria-hidden="true" />
            <span className="alias-score-name">{team.name}</span>
            <span className="alias-score-value">{team.score}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface WordChipProps {
  word: string;
  correct: boolean;
}

export function WordChip({ word, correct }: WordChipProps) {
  return (
    <li className={`alias-word-chip${correct ? " is-correct" : " is-skipped"}`}>
      <span aria-hidden="true">{correct ? "✓" : "✕"}</span>
      {word}
    </li>
  );
}
