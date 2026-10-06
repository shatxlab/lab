import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MenuScreen } from "@/components/couples/MenuScreen";
import { PlayScreen } from "@/components/couples/PlayScreen";
import { SetupScreen } from "@/components/couples/SetupScreen";
import { SummaryScreen } from "@/components/couples/SummaryScreen";
import { questionsFor, resolveOptions } from "@/lib/couples/questions";
import { defaultSettings } from "@/lib/couples/storage";
import type { RoundResult } from "@/lib/couples/types";

const settings = defaultSettings();
const question = questionsFor("norm", "all")[0];
const options = resolveOptions(question, settings.names);

describe("couples screens render", () => {
  it("menu lists the three games and the shared stats", () => {
    const html = renderToStaticMarkup(
      <MenuScreen lang="ru" stats={{ games: 2, cards: 40, matches: 30 }} onPick={() => undefined} />,
    );
    expect(html).toContain("Норм или стрём");
    expect(html).toContain("ИлиТо");
    expect(html).toContain("Кто из нас");
    expect(html).toContain("75%");
  });

  it("hides the stats line for a first-time visitor", () => {
    const html = renderToStaticMarkup(
      <MenuScreen lang="ru" stats={{ games: 0, cards: 0, matches: 0 }} onPick={() => undefined} />,
    );
    expect(html).not.toContain("Игр сыграно");
  });

  it("setup shows names, themes and the start button", () => {
    const html = renderToStaticMarkup(
      <SetupScreen
        settings={settings}
        onChange={() => undefined}
        onStart={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(html).toContain("Как вас зовут?");
    expect(html).toContain("Все темы");
    expect(html).toContain("Начать игру");
    expect(html).toContain("3000");
  });

  it("play renders the prompt and both options", () => {
    const html = renderToStaticMarkup(
      <PlayScreen
        settings={settings}
        question={question}
        options={options}
        index={0}
        total={10}
        phase="voteA"
        votes={{ a: null, b: null }}
        soundOn
        onVote={() => undefined}
        onPass={() => undefined}
        onNext={() => undefined}
        onExit={() => undefined}
        onToggleSound={() => undefined}
      />,
    );
    expect(html).toContain("Норм");
    expect(html).toContain("Стрём");
    expect(html).toContain("1 / 10");
  });

  it("play shows the handoff cover", () => {
    const html = renderToStaticMarkup(
      <PlayScreen
        settings={settings}
        question={question}
        options={options}
        index={0}
        total={10}
        phase="handoff"
        votes={{ a: 0, b: null }}
        soundOn
        onVote={() => undefined}
        onPass={() => undefined}
        onNext={() => undefined}
        onExit={() => undefined}
        onToggleSound={() => undefined}
      />,
    );
    expect(html).toContain("Передайте телефон");
    expect(html).toContain("Игрок 2");
  });

  it("summary reports the match percentage and verdict", () => {
    const results: RoundResult[] = [
      { question, picks: [0, 0], match: true },
      { question, picks: [0, 1], match: false },
    ];
    const html = renderToStaticMarkup(
      <SummaryScreen
        settings={settings}
        results={results}
        onPlayAgain={() => undefined}
        onSettings={() => undefined}
        onMenu={() => undefined}
      />,
    );
    expect(html).toContain("50%");
    expect(html).toContain("1 / 2");
    expect(html).toContain("Ещё раз с новыми вопросами");
  });
});