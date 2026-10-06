// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ToolsGrid from "@/components/apps/ToolsGrid";

describe("ToolsGrid", () => {
  it("renders English cards by default", () => {
    const html = renderToStaticMarkup(<ToolsGrid />);
    expect(html).toContain("Pick a tool");
    expect(html).toContain("EPUB reader");
    expect(html).toContain("Document viewer");
    expect(html).toContain("Alias word game");
    expect(html).toContain("Crossword");
    expect(html).toContain("Games for couples");
  });

  it("renders Russian cards when the shared language is Russian", () => {
    localStorage.setItem("lab:lang", "ru");
    const html = renderToStaticMarkup(<ToolsGrid />);
    expect(html).toContain("Инструменты");
    expect(html).toContain("Выберите инструмент");
    expect(html).toContain("EPUB-читалка");
    expect(html).toContain("Просмотр документов");
    expect(html).toContain("Алиас");
    expect(html).toContain("Кроссворд");
    expect(html).toContain("Игры для пар");
  });
});
