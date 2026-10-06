import { matchScore, percentText, stringsFor, verdictFor } from "@/lib/couples/i18n";
import { resolveOptions } from "@/lib/couples/questions";
import type { CouplesSettings, RoundResult } from "@/lib/couples/types";

interface SummaryScreenProps {
  settings: CouplesSettings;
  results: RoundResult[];
  onPlayAgain(): void;
  onSettings(): void;
  onMenu(): void;
}

function MatchSummary({ settings, results }: { settings: CouplesSettings; results: RoundResult[] }) {
  const TXT = stringsFor(settings.lang);
  const total = results.length;
  const matched = results.filter((result) => result.match).length;
  const percent = total > 0 ? Math.round((matched / total) * 100) : 0;
  const [nameA, nameB] = settings.names;

  return (
    <>
      <div className="cp-score">
        <span className="cp-score-value">{percentText(percent)}</span>
        <span className="cp-score-label">{TXT.summaryMatchTitle}</span>
        <span className="cp-score-sub">{matchScore(matched, total)}</span>
      </div>
      <p className="cp-verdict">{verdictFor(settings.lang, total > 0 ? matched / total : 0)}</p>

      <ul className="cp-results">
        {results.map((result, index) => {
          const options = resolveOptions(result.question, settings.names);
          return (
            <li key={`${result.question.id}-${index}`} className="cp-result" data-match={result.match}>
              <span className="cp-result-mark" aria-hidden="true">
                {result.match ? "🤝" : "↔️"}
              </span>
              <span className="cp-result-body">
                <span className="cp-result-prompt">{result.question.prompt}</span>
                <span className="cp-result-picks">
                  {nameA}: {options[result.picks[0] ?? 0]} · {nameB}: {options[result.picks[1] ?? 0]}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function TogetherSummary({ settings, results }: { settings: CouplesSettings; results: RoundResult[] }) {
  const TXT = stringsFor(settings.lang);
  const tally = new Map<string, number>();
  for (const result of results) {
    const options = resolveOptions(result.question, settings.names);
    const chosen = options[result.picks[0] ?? 0];
    tally.set(chosen, (tally.get(chosen) ?? 0) + 1);
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 5);

  return (
    <>
      <div className="cp-score cp-score-small">
        <span className="cp-score-value">{results.length}</span>
        <span className="cp-score-label">{TXT.summaryCards}</span>
      </div>
      {top.length > 0 ? (
        <div className="cp-tally">
          <p className="cp-tally-title">{TXT.summaryTopChoice}</p>
          <ul className="cp-tally-list">
            {top.map(([label, count]) => (
              <li key={label}>
                <span>{label}</span>
                <span className="cp-tally-count">{count}×</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="cp-results">
        {results.map((result, index) => {
          const options = resolveOptions(result.question, settings.names);
          return (
            <li key={`${result.question.id}-${index}`} className="cp-result" data-match="true">
              <span className="cp-result-mark" aria-hidden="true">
                ✅
              </span>
              <span className="cp-result-body">
                <span className="cp-result-prompt">{result.question.prompt}</span>
                <span className="cp-result-picks">{TXT.summaryChose}: {options[result.picks[0] ?? 0]}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function SummaryScreen({ settings, results, onPlayAgain, onSettings, onMenu }: SummaryScreenProps) {
  const TXT = stringsFor(settings.lang);
  return (
    <div className="cp-summary">
      <header className="cp-summary-hero">
        <p className="cp-eyebrow">{TXT.appName}</p>
        <h1>{settings.mode === "match" ? TXT.summaryMatchTitle : TXT.summaryTogetherTitle}</h1>
      </header>

      {settings.mode === "match" ? (
        <MatchSummary settings={settings} results={results} />
      ) : (
        <TogetherSummary settings={settings} results={results} />
      )}

      <div className="cp-summary-actions">
        <button type="button" className="cp-primary cp-wide" onClick={onPlayAgain}>
          {TXT.summaryPlayAgain}
        </button>
        <div className="cp-summary-row">
          <button type="button" className="cp-secondary" onClick={onSettings}>
            {TXT.summarySettings}
          </button>
          <button type="button" className="cp-secondary" onClick={onMenu}>
            {TXT.summaryMenu}
          </button>
        </div>
      </div>
    </div>
  );
}