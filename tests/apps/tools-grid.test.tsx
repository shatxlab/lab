// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ToolsGrid from "@/components/apps/ToolsGrid";
import { TOOLS, toolHref } from "@/lib/apps/tools";
import { mount } from "../helpers/dom";

describe("ToolsGrid", () => {
  it("renders English cards by default", () => {
    const html = renderToStaticMarkup(<ToolsGrid />);
    expect(html).toContain("Your data stays yours.");
    expect(html).toContain("EPUB reader");
    expect(html).toContain("Document viewer");
    expect(html).toContain("Alias word game");
    expect(html).toContain("Crossword");
    expect(html).toContain("Games for couples");
  });

  it("renders Russian cards on the client when the shared language is Russian", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await mount(<ToolsGrid />);
    const text = view.container.textContent ?? "";
    expect(text).toContain("Ваши инструменты.");
    expect(text).toContain("Данные остаются у вас.");
    expect(text).toContain("EPUB-читалка");
    expect(text).toContain("Просмотр документов");
    expect(text).toContain("Алиас");
    expect(text).toContain("Кроссворд");
    expect(text).toContain("Вордли");
    expect(text).toContain("Игры для пар");
    view.unmount();
  });

  it("prerenders English even when another language is stored (hydration-safe)", () => {
    localStorage.setItem("lab:lang", "ru");
    expect(renderToStaticMarkup(<ToolsGrid />)).toContain("Your tools.");
  });

  it("groups the tools by category and lists every registered tool", () => {
    const html = renderToStaticMarkup(<ToolsGrid />);
    for (const heading of ["Read &amp; view", "Utilities", "Games"]) expect(html).toContain(heading);
    for (const tool of TOOLS) expect(html).toContain(`href="${toolHref(tool)}"`);
  });
});
