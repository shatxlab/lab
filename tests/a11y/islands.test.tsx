// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import AliasGame from "@/components/alias/AliasGame";
import CouplesGame from "@/components/couples/CouplesGame";
import CrosswordGame from "@/components/crossword/CrosswordGame";
import LangToggle from "@/components/apps/LangToggle";
import ThemeToggle from "@/components/apps/ThemeToggle";
import ToolsGrid from "@/components/apps/ToolsGrid";
import { axeViolations, mount, waitFor } from "../helpers/dom";

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe.each([
  ["en"],
  ["ru"],
] as const)("accessibility of every tool's first screen (%s)", (lang) => {
  const cases: [string, () => React.ReactElement][] = [
    ["tools index", () => <ToolsGrid />],
    ["header toggles", () => (
      <header>
        <LangToggle />
        <ThemeToggle />
      </header>
    )],
    ["Alias", () => <AliasGame />],
    ["Crossword", () => <CrosswordGame />],
    ["Couples", () => <CouplesGame />],
  ];

  it.each(cases)("%s has no detectable violations", async (_name, render) => {
    localStorage.setItem("lab:lang", lang);
    // axe's page-level rules need a document landmark/title; scope to the island instead.
    const view = await mount(render());
    await waitFor(() => expect(view.container.firstElementChild).toBeTruthy());
    expect(await axeViolations(view.container)).toEqual([]);
    view.unmount();
  }, 40_000);
});
