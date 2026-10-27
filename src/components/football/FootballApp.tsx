import { useCallback, useEffect, useMemo, useState } from "react";

import { withBase } from "@/lib/apps/paths";
import { useAppLang, useLangReady } from "@/lib/apps/use-app-lang";
import { FOOTBALL_TEXT, type FootballText } from "@/lib/football/i18n";
import { defaultSave, friendlySides, LEVELS, readSave, recordMatch, writeSave, type FootballSave, type Level } from "@/lib/football/meta";
import { KITS } from "@/lib/football/render/sprites";
import { createMatch, winner } from "@/lib/football/sim/match";
import type { Match } from "@/lib/football/sim/types";

import { MatchView } from "./MatchView";

interface Result {
  match: Match;
  level: Level;
}

export default function FootballApp() {
  const lang = useAppLang();
  const text = FOOTBALL_TEXT[lang];
  const readyRef = useLangReady<HTMLDivElement>();
  const [save, setSave] = useState<FootballSave>(defaultSave);
  const [level, setLevel] = useState<Level>("league");
  const [match, setMatch] = useState<Match | null>(null);
  const [playing, setPlaying] = useState<Level>("league");
  const [result, setResult] = useState<Result | null>(null);

  // Storage only exists in the browser; read it after mount.
  useEffect(() => setSave(readSave()), []);

  const setKit = (kit: number) => {
    const next = { ...save, kit };
    setSave(next);
    writeSave(next);
  };

  const start = (chosen: Level) => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const rival = text.rivalNames[seed % text.rivalNames.length];
    setResult(null);
    setPlaying(chosen);
    setMatch(createMatch(friendlySides(seed, chosen, save.kit, rival, text.homeName), seed, 0));
  };

  const finish = useCallback(
    (ended: Match) => {
      // Read the stored save rather than the render's copy: the loop calls this from a frame callback.
      const after = recordMatch(readSave(), playing, ended.score[0], ended.score[1]);
      writeSave(after);
      setSave(after);
      setResult({ match: ended, level: playing });
    },
    [playing],
  );

  return (
    <div className="tower-root fb-root" ref={readyRef} data-lang-sensitive>
      {match ? (
        <MatchView key={match.rng} match={match} text={text} onOver={finish} onLeave={() => setMatch(null)}>
          {result && (
            <div className="tower-overlay" role="dialog" aria-modal="true" aria-labelledby="fb-over-title">
              <FullTime
                text={text}
                result={result}
                onAgain={() => start(result.level)}
                onMenu={() => {
                  setResult(null);
                  setMatch(null);
                }}
              />
            </div>
          )}
        </MatchView>
      ) : (
        <MenuScreen text={text} save={save} level={level} onLevel={setLevel} onKit={setKit} onPlay={() => start(level)} />
      )}
    </div>
  );
}

function MenuScreen({
  text,
  save,
  level,
  onLevel,
  onKit,
  onPlay,
}: {
  text: FootballText;
  save: FootballSave;
  level: Level;
  onLevel: (level: Level) => void;
  onKit: (kit: number) => void;
  onPlay: () => void;
}) {
  return (
    <div className="tower-screen">
      <div className="tower-panel tower-menu fb-menu">
        <h1>{text.title}</h1>
        <p className="tower-tagline">{text.tagline}</p>

        <h2 className="fb-heading">{text.chooseKit}</h2>
        <div className="fb-kits" role="radiogroup" aria-label={text.chooseKit}>
          {KITS.map((kit, index) => (
            <button
              key={kit.name}
              type="button"
              role="radio"
              aria-checked={save.kit === index}
              aria-label={text.kitNames[index]}
              className="fb-kit"
              data-on={save.kit === index}
              style={{ background: `linear-gradient(135deg, ${kit.jersey} 55%, ${kit.shorts} 55%)`, borderColor: kit.trim }}
              onClick={() => onKit(index)}
            />
          ))}
        </div>

        <h2 className="fb-heading">{text.chooseOpponent}</h2>
        <div className="fb-levels" role="radiogroup" aria-label={text.chooseOpponent}>
          {LEVELS.map((id) => {
            const record = save.records[id];
            return (
              <button key={id} type="button" role="radio" aria-checked={level === id} className="fb-level" data-on={level === id} onClick={() => onLevel(id)}>
                <span className="fb-level-name">{text.levels[id].name}</span>
                <span className="fb-level-record">{record.played > 0 ? text.record(record.won, record.drawn, record.lost) : ""}</span>
                <span className="fb-level-description">{text.levels[id].description}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="tower-button fb-kickoff" onClick={onPlay}>
          {text.kickOff}
        </button>
        <p className="fb-landscape">{text.landscapeNote}</p>
        <ul className="tower-howto">
          {text.howTo.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <a className="tower-home" href={withBase("/")}>
          {text.home}
        </a>
      </div>
    </div>
  );
}

function FullTime({ text, result, onAgain, onMenu }: { text: FootballText; result: Result; onAgain: () => void; onMenu: () => void }) {
  const { match } = result;
  const w = winner(match);
  const [home, away] = match.stats;
  const goals = useMemo(
    () =>
      match.events
        .filter((event) => event.kind === "goal")
        .map((event) => ({
          team: event.team,
          name: event.who !== undefined ? match.players[event.who].name : "",
          minute: Math.max(1, Math.ceil((event.t / 120) * 90)),
        })),
    [match],
  );
  const share = (value: number, other: number) => `${Math.round((value / Math.max(1, value + other)) * 100)}%`;
  const rows: [string, string, string][] = [
    [text.statNames.shots, String(home.shots), String(away.shots)],
    [text.statNames.onTarget, String(home.onTarget), String(away.onTarget)],
    [text.statNames.chances, home.xg.toFixed(1), away.xg.toFixed(1)],
    [text.statNames.possession, share(home.possession, away.possession), share(away.possession, home.possession)],
    [text.statNames.passes, share(home.passesDone, home.passes - home.passesDone), share(away.passesDone, away.passes - away.passesDone)],
    [text.statNames.tackles, String(home.tackles), String(away.tackles)],
  ];
  return (
    <div className="tower-panel fb-fulltime">
      <h2 id="fb-over-title">{w === 0 ? text.won : w === 1 ? text.lost : text.drawn}</h2>
      <p className="fb-final" aria-label={`${match.sides[0].name} ${match.score[0]}, ${match.sides[1].name} ${match.score[1]}`}>
        <span>{match.sides[0].name}</span>
        <strong>
          {match.score[0]} – {match.score[1]}
        </strong>
        <span>{match.sides[1].name}</span>
      </p>
      <h3 className="fb-heading">{text.scorers}</h3>
      {goals.length === 0 ? (
        <p className="fb-none">{text.noScorers}</p>
      ) : (
        <ul className="fb-scorers">
          {goals.map((goal, index) => (
            <li key={index} data-team={goal.team}>
              {text.minute(goal.minute)} {goal.name}
            </li>
          ))}
        </ul>
      )}
      <table className="fb-stats">
        <tbody>
          {rows.map(([label, a, b]) => (
            <tr key={label}>
              <td>{a}</td>
              <th scope="row">{label}</th>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tower-actions">
        <button type="button" className="tower-button" onClick={onAgain} autoFocus>
          {text.playAgain}
        </button>
        <button type="button" className="tower-button tower-button-quiet" onClick={onMenu}>
          {text.menu}
        </button>
      </div>
    </div>
  );
}
