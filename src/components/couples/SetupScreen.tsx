import type { CSSProperties } from "react";
import { Volume2, VolumeX } from "lucide-react";

import { TXT } from "@/lib/couples/i18n";
import { questionCount } from "@/lib/couples/questions";
import { CARD_COUNTS, getGame, THEMES } from "@/lib/couples/themes";
import type { CouplesSettings } from "@/lib/couples/types";

interface SetupScreenProps {
  settings: CouplesSettings;
  onChange(partial: Partial<CouplesSettings>): void;
  onStart(): void;
  onBack(): void;
}

export function SetupScreen({ settings, onChange, onStart, onBack }: SetupScreenProps) {
  const game = getGame(settings.game);
  const available = questionCount(settings.game, settings.theme);

  const setName = (index: 0 | 1, value: string) => {
    const names: [string, string] = [settings.names[0], settings.names[1]];
    names[index] = value;
    onChange({ names });
  };

  return (
    <div className="cp-setup">
      <div className="cp-setup-scroll">
        <header className="cp-setup-hero">
        <button type="button" className="cp-back" onClick={onBack}>
          ← {TXT.back}
        </button>
        <p className="cp-eyebrow">{TXT.setupTitle}</p>
        <h1>
          <span aria-hidden="true">{game.emoji}</span> {game.name}
        </h1>
        <p className="cp-note">{game.description}</p>
      </header>

      <section className="cp-field">
        <div className="cp-field-head">
          <h2>{TXT.names}</h2>
          <p>{TXT.namesHint}</p>
        </div>
        <div className="cp-name-grid">
          <label className="cp-name">
            <span>{TXT.nameOne}</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={24}
              value={settings.names[0]}
              placeholder={TXT.nameOne}
              onChange={(event) => setName(0, event.target.value)}
            />
          </label>
          <label className="cp-name">
            <span>{TXT.nameTwo}</span>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              maxLength={24}
              value={settings.names[1]}
              placeholder={TXT.nameTwo}
              onChange={(event) => setName(1, event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="cp-field">
        <div className="cp-field-head">
          <h2>{TXT.mode}</h2>
          <p>{settings.mode === "match" ? TXT.modeMatchHint : TXT.modeTogetherHint}</p>
        </div>
        <div className="cp-segmented">
          <button
            type="button"
            className={settings.mode === "match" ? "is-active" : ""}
            aria-pressed={settings.mode === "match"}
            onClick={() => onChange({ mode: "match" })}
          >
            🤫 {TXT.modeMatch}
          </button>
          <button
            type="button"
            className={settings.mode === "together" ? "is-active" : ""}
            aria-pressed={settings.mode === "together"}
            onClick={() => onChange({ mode: "together" })}
          >
            💬 {TXT.modeTogether}
          </button>
        </div>
      </section>

      <section className="cp-field">
        <div className="cp-field-head">
          <h2>{TXT.theme}</h2>
          <p>{TXT.themeHint}</p>
        </div>
        <div className="cp-theme-grid">
          <button
            type="button"
            className={`cp-theme${settings.theme === "all" ? " is-selected" : ""}`}
            aria-pressed={settings.theme === "all"}
            onClick={() => onChange({ theme: "all" })}
          >
            <span className="cp-theme-emoji" aria-hidden="true">
              🎲
            </span>
            <span className="cp-theme-name">{TXT.themeAll}</span>
            <span className="cp-theme-count">{questionCount(settings.game, "all")}</span>
          </button>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`cp-theme${settings.theme === theme.id ? " is-selected" : ""}`}
              style={{ "--theme-accent": theme.accent } as CSSProperties}
              aria-pressed={settings.theme === theme.id}
              onClick={() => onChange({ theme: theme.id })}
            >
              <span className="cp-theme-emoji" aria-hidden="true">
                {theme.emoji}
              </span>
              <span className="cp-theme-name">{theme.name}</span>
              <span className="cp-theme-count">{questionCount(settings.game, theme.id)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="cp-field">
        <div className="cp-field-head">
          <h2>{TXT.count}</h2>
          <p>{TXT.countHint}</p>
        </div>
        <div className="cp-segmented cp-segmented-count">
          {CARD_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              className={settings.count === count ? "is-active" : ""}
              aria-pressed={settings.count === count}
              onClick={() => onChange({ count })}
            >
              {count} {TXT.cards}
            </button>
          ))}
        </div>
      </section>

      <section className="cp-field cp-field-inline">
        <h2>{TXT.sound}</h2>
        <button
          type="button"
          className="cp-sound"
          aria-pressed={settings.sound}
          onClick={() => onChange({ sound: !settings.sound })}
        >
          {settings.sound ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
          {settings.sound ? TXT.soundOn : TXT.soundOff}
        </button>
      </section>

        </div>

      <div className="cp-setup-footer">
        <div className="cp-setup-footer-inner">
          <p className="cp-available">{available} вопросов в колоде</p>
          <button type="button" className="cp-primary" onClick={onStart}>
            {TXT.startGame}
          </button>
        </div>
      </div>
    </div>
  );
}