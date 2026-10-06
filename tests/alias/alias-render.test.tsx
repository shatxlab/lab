// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SetupScreen } from "@/components/alias/SetupScreen";
import { ReadyScreen, RoundScreen } from "@/components/alias/PlayScreens";
import { ResultsScreen } from "@/components/alias/ResultsScreen";
import { defaultSettings, defaultTeams, makeTeam } from "@/lib/alias/game";
import { getTheme } from "@/lib/alias/themes";
import type { Team, TurnResult } from "@/lib/alias/types";

const noop = () => undefined;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
});

function setupProps(overrides: Partial<Parameters<typeof SetupScreen>[0]> = {}) {
  return {
    settings: defaultSettings(),
    teams: defaultTeams("en"),
    deckCount: 1234,
    onChange: noop,
    onRenameTeam: noop,
    onAddTeam: noop,
    onRemoveTeam: noop,
    onStart: noop,
    ...overrides,
  };
}

describe("SetupScreen", () => {
  it("renders all ten theme cards with the deck size", () => {
    const markup = renderToStaticMarkup(<SetupScreen {...setupProps()} />);
    expect((markup.match(/alias-theme-card/g) ?? []).length).toBe(10);
    expect(markup).toContain("1,234");
    expect(markup).toContain("Everyday life");
    expect(markup).toContain("Food &amp; drinks");
  });

  it("reports a selected theme", () => {
    const onChange = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<SetupScreen {...setupProps({ onChange })} />));

    const food = host.querySelector<HTMLButtonElement>('[data-theme-id="food"]');
    expect(food).not.toBeNull();
    act(() => food?.click());
    expect(onChange).toHaveBeenCalledWith({ themeId: "food" });
  });

  it("disables start until two teams exist", () => {
    const oneTeam = renderToStaticMarkup(
      <SetupScreen {...setupProps({ teams: [makeTeam("a", "Solo", "#111")] })} />,
    );
    expect(oneTeam).toContain('disabled=""');
  });
});

describe("PlayScreens", () => {
  const team: Team = makeTeam("t1", "Comets", "#667eea", 4);

  it("starts a round from the ready screen", () => {
    const onStart = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        <ReadyScreen
          lang="en"
          theme={getTheme("food")}
          team={team}
          teams={[team]}
          targetScore={30}
          onStart={onStart}
          onExit={noop}
        />,
      ),
    );

    const button = host.querySelector<HTMLButtonElement>(".alias-start-round");
    act(() => button?.click());
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("shows the word and counts guesses and skips", () => {
    const markup = renderToStaticMarkup(
      <RoundScreen
        lang="ru"
        theme={getTheme("animals")}
        team={team}
        word="жираф"
        remaining={42}
        total={60}
        words={[
          { word: "слон", correct: true },
          { word: "тигр", correct: false },
        ]}
        onCorrect={noop}
        onSkip={noop}
        onFinish={noop}
      />,
    );

    expect(markup).toContain("жираф");
    expect(markup).toContain("alias-tally-correct");
    expect(markup).toContain("alias-tally-skipped");
    expect(markup).toMatch(/alias-tally-correct[\s\S]*?1<\/span>/);
  });
});

describe("ResultsScreen", () => {
  const team = makeTeam("t1", "Comets", "#667eea", 11);
  const result: TurnResult = {
    teamId: "t1",
    points: 2,
    words: [
      { word: "apple", correct: true },
      { word: "pear", correct: false },
    ],
  };

  it("lists the turn words and offers the next team", () => {
    const markup = renderToStaticMarkup(
      <ResultsScreen
        lang="en"
        theme={getTheme("everyday")}
        teams={[team]}
        result={result}
        team={team}
        targetScore={30}
        isGameOver={false}
        winner={null}
        onNext={noop}
        onPlayAgain={noop}
        onSetup={noop}
      />,
    );

    expect(markup).toContain("apple");
    expect(markup).toContain("pear");
    expect(markup).toContain("Next team");
    expect(markup).not.toContain("Play again");
  });

  it("announces the winner on game over", () => {
    const markup = renderToStaticMarkup(
      <ResultsScreen
        lang="en"
        theme={getTheme("everyday")}
        teams={[team]}
        result={result}
        team={team}
        targetScore={10}
        isGameOver
        winner={team}
        onNext={noop}
        onPlayAgain={noop}
        onSetup={noop}
      />,
    );

    expect(markup).toContain("Comets wins!");
    expect(markup).toContain("Play again");
  });
});
