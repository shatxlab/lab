import { Plus, Sparkles, Trash2, Volume2, VolumeX } from "lucide-react";
import type { CSSProperties } from "react";

import { t } from "@/lib/alias/i18n";
import {
  MAX_TEAMS,
  MIN_TEAMS,
  ROUND_SECONDS_OPTIONS,
  SKIP_PENALTY_OPTIONS,
  TARGET_SCORE_OPTIONS,
} from "@/lib/alias/game";
import { THEMES } from "@/lib/alias/themes";
import { deckSize } from "@/lib/alias/words";
import type { AliasSettings, Lang, Team, ThemeId } from "@/lib/alias/types";
import { ThemeCard } from "@/components/alias/parts";

interface OptionGroupProps<T extends number> {
  options: readonly T[];
  value: T;
  label: string;
  render: (option: T) => string;
  onChange: (option: T) => void;
}

function OptionGroup<T extends number>({
  options,
  value,
  label,
  render,
  onChange,
}: OptionGroupProps<T>) {
  return (
    <div className="alias-options" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`alias-option${option === value ? " is-active" : ""}`}
          aria-pressed={option === value}
          onClick={() => onChange(option)}
        >
          {render(option)}
        </button>
      ))}
    </div>
  );
}

interface SetupScreenProps {
  settings: AliasSettings;
  teams: Team[];
  deckCount: number;
  onChange: (partial: Partial<AliasSettings>) => void;
  onRenameTeam: (id: string, name: string) => void;
  onAddTeam: () => void;
  onRemoveTeam: (id: string) => void;
  onStart: () => void;
}

export function SetupScreen({
  settings,
  teams,
  deckCount,
  onChange,
  onRenameTeam,
  onAddTeam,
  onRemoveTeam,
  onStart,
}: SetupScreenProps) {
  const { lang } = settings;
  const canStart = teams.length >= MIN_TEAMS && teams.some((team) => team.name.trim().length > 0);

  const selectTheme = (themeId: ThemeId) => {
    onChange({ themeId });
  };

  return (
    <div className="alias-setup">
      <header className="alias-hero">
        <p className="alias-eyebrow">
          <Sparkles aria-hidden="true" /> {t(lang, "appName")}
        </p>
        <h1>{t(lang, "tagline")}</h1>

      </header>

      <section className="alias-section" aria-labelledby="alias-theme-title">
        <div className="alias-section-head">
          <h2 id="alias-theme-title">{t(lang, "chooseTheme")}</h2>
          <span className="alias-badge">
            {deckCount.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} {t(lang, "wordsInDeck")}
          </span>
        </div>
        <div className="alias-theme-grid">
          {THEMES.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              lang={lang}
              selected={theme.id === settings.themeId}
              count={deckSize(lang, theme.id)}
              onSelect={() => selectTheme(theme.id)}
            />
          ))}
        </div>
      </section>

      <section className="alias-section" aria-labelledby="alias-teams-title">
        <div className="alias-section-head">
          <h2 id="alias-teams-title">{t(lang, "teams")}</h2>
          <span className="alias-section-hint">{t(lang, "teamsHint")}</span>
        </div>
        <ul className="alias-team-list">
          {teams.map((team) => (
            <li key={team.id} className="alias-team-row">
              <span
                className="alias-team-swatch"
                style={{ "--team-color": team.color } as CSSProperties}
                aria-hidden="true"
              />
              <input
                type="text"
                value={team.name}
                maxLength={40}
                placeholder={t(lang, "teamPlaceholder")}
                aria-label={t(lang, "teamPlaceholder")}
                onChange={(event) => onRenameTeam(team.id, event.target.value)}
              />
              <button
                type="button"
                className="alias-icon-button"
                onClick={() => onRemoveTeam(team.id)}
                disabled={teams.length <= MIN_TEAMS}
                aria-label={t(lang, "removeTeam")}
                title={t(lang, "removeTeam")}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="alias-secondary-button"
          onClick={onAddTeam}
          disabled={teams.length >= MAX_TEAMS}
        >
          <Plus aria-hidden="true" /> {t(lang, "addTeam")}
        </button>
      </section>

      <section className="alias-section alias-settings" aria-labelledby="alias-settings-title">
        <div className="alias-section-head">
          <h2 id="alias-settings-title">{t(lang, "roundTime")}</h2>
        </div>
        <div className="alias-setting-row">
          <span className="alias-setting-label">{t(lang, "roundTime")}</span>
          <OptionGroup
            options={ROUND_SECONDS_OPTIONS}
            value={settings.roundSeconds as (typeof ROUND_SECONDS_OPTIONS)[number]}
            label={t(lang, "roundTime")}
            render={(option) => `${option}${t(lang, "secondsSuffix")}`}
            onChange={(option) => onChange({ roundSeconds: option })}
          />
        </div>
        <div className="alias-setting-row">
          <span className="alias-setting-label">{t(lang, "targetScore")}</span>
          <OptionGroup
            options={TARGET_SCORE_OPTIONS}
            value={settings.targetScore as (typeof TARGET_SCORE_OPTIONS)[number]}
            label={t(lang, "targetScore")}
            render={(option) => `${option} ${t(lang, "pointsSuffix")}`}
            onChange={(option) => onChange({ targetScore: option })}
          />
        </div>
        <div className="alias-setting-row">
          <span className="alias-setting-label">
            {t(lang, "skipPenalty")}
            <small>{t(lang, "skipPenaltyHint")}</small>
          </span>
          <OptionGroup
            options={SKIP_PENALTY_OPTIONS}
            value={settings.skipPenalty as (typeof SKIP_PENALTY_OPTIONS)[number]}
            label={t(lang, "skipPenalty")}
            render={(option) => (option === 0 ? "0" : `−${option}`)}
            onChange={(option) => onChange({ skipPenalty: option })}
          />
        </div>
        <div className="alias-setting-row">
          <span className="alias-setting-label">{t(lang, "sound")}</span>
          <button
            type="button"
            className={`alias-toggle${settings.sound ? " is-on" : ""}`}
            aria-pressed={settings.sound}
            onClick={() => onChange({ sound: !settings.sound })}
          >
            {settings.sound ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            {settings.sound ? t(lang, "soundOn") : t(lang, "soundOff")}
          </button>
        </div>
      </section>

      <section className="alias-section alias-rules" aria-labelledby="alias-rules-title">
        <h2 id="alias-rules-title">{t(lang, "rulesTitle")}</h2>
        <ol>
          <li>{t(lang, "ruleOne")}</li>
          <li>{t(lang, "ruleTwo")}</li>
          <li>{t(lang, "ruleThree")}</li>
          <li>{t(lang, "ruleFour")}</li>
        </ol>
      </section>

      <div className="alias-start-bar">
        <button type="button" className="alias-primary-button" onClick={onStart} disabled={!canStart}>
          {t(lang, "startGame")}
        </button>
      </div>
    </div>
  );
}
