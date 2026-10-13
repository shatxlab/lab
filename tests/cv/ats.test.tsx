// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CvDocument } from "@/components/cv/CvDocument";
import { HEADINGS } from "@/lib/cv/sections";
import { TEMPLATE_IDS, exampleCv, newProject, type Cv, type CvLang } from "@/lib/cv/schema";
import { addItem, setProfile, setSettings, updateItem } from "@/lib/cv/edit";

const CSS = readFileSync(resolve(process.cwd(), "src/styles/cv.css"), "utf8");

function render(cv: Cv): Document {
  return new DOMParser().parseFromString(`<body>${renderToStaticMarkup(<CvDocument cv={cv} />)}</body>`, "text/html");
}
const example = (lang: CvLang = "en") => {
  let cv = exampleCv(lang);
  cv = addItem(cv, "projects", { ...newProject(), name: "Side project", url: "https://example.com/p", bullets: ["Shipped it."] });
  return cv;
};

describe.each(TEMPLATE_IDS)("the %s template is ATS-safe by construction", (template) => {
  const cv = setSettings(example(), { template });

  it("is one column of plain elements: no tables, images, drawings, frames or scripts", () => {
    const doc = render(cv);
    for (const tag of ["table", "tr", "td", "img", "svg", "canvas", "iframe", "object", "embed", "script", "style", "input", "button", "form"]) {
      expect(doc.querySelector(tag), `<${tag}> found`).toBeNull();
    }
  });

  it("has one h1 with the name, then the standard section headings in a fixed order", () => {
    const doc = render(cv);
    expect([...doc.querySelectorAll("h1")].map((h) => h.textContent)).toEqual(["Alex Morgan"]);
    expect([...doc.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Summary", "Experience", "Education", "Projects", "Skills"]);
  });

  it("reads in order: name, title, contact, then each section, with the title before its dates", () => {
    const text = render(cv).body.textContent!;
    const order = ["Alex Morgan", "Software engineer", "alex.morgan@example.com", "Summary", "Experience", "Senior engineer", "Mar 2022", "Education", "Skills"].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("states dates and places as text, not as icons", () => {
    const doc = render(cv);
    expect(doc.body.textContent).toContain("Mar 2022 – Present");
    expect(doc.body.textContent).toContain("Austin, TX");
  });

  it("marks the language of the document", () => {
    expect(render(cv).querySelector("article")!.getAttribute("lang")).toBe("en");
    expect(render(setSettings(example("ru"), { template })).querySelector("article")!.getAttribute("lang")).toBe("ru");
  });

  it("uses the standard Russian headings for a Russian CV", () => {
    const doc = render(setSettings(example("ru"), { template }));
    expect([...doc.querySelectorAll("h2")].map((h) => h.textContent)).toEqual([HEADINGS.ru.summary, HEADINGS.ru.experience, HEADINGS.ru.education, HEADINGS.ru.projects, HEADINGS.ru.skills]);
  });
});

describe("links and anything typed", () => {
  it("links only web addresses; other text stays text", () => {
    let cv = example();
    cv = updateItem(cv, "links", cv.links[0]!.id, { url: "javascript:alert(1)", label: "Evil" });
    cv = addItem(cv, "links", { id: "x", label: "Site", url: "https://example.com" });
    const doc = render(cv);
    expect([...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"))).not.toContain("javascript:alert(1)");
    expect([...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toContain("https://example.com");
    expect(doc.body.textContent).toContain("javascript:alert(1)");
  });

  it("never turns typed text into markup", () => {
    const cv = setProfile(example(), { fullName: `<img src=x onerror=alert(1)>`, summary: `<script>alert(1)</script>` });
    const doc = render(cv);
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("h1")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("leaves out empty sections and shows an empty CV as nothing", () => {
    const doc = render(setSettings(example(), {}));
    expect(doc.querySelectorAll("section")).toHaveLength(5);
    const empty = new DOMParser().parseFromString(`<body>${renderToStaticMarkup(<CvDocument cv={{ ...example(), profile: { ...example().profile, summary: "" }, experiences: [], education: [], projects: [], skills: [] }} />)}</body>`, "text/html");
    expect(empty.querySelectorAll("section")).toHaveLength(0);
  });
});

describe("the stylesheet", () => {
  /** The rules that style the sheet itself (not the page around it). */
  const sheetRules = CSS.replace(/\/\*[\s\S]*?\*\//g, "").split("}").filter((rule) => rule.includes(".cv-sheet") && !rule.includes("@media print"));

  it("has no layout a parser reads badly: no floats, columns, grid, absolute positioning or letter-spacing", () => {
    expect(sheetRules.length).toBeGreaterThan(10);
    for (const rule of sheetRules) {
      expect(rule, rule).not.toMatch(/float\s*:|column-count|columns\s*:|display\s*:\s*(inline-)?grid|position\s*:\s*(absolute|fixed)|letter-spacing|small-caps|writing-mode|text-orientation/);
    }
  });

  it("uses only regular and bold weights, so headings stay whole text in a PDF", () => {
    const weights = [...CSS.matchAll(/font-weight\s*:\s*(\d+)/g)].map((m) => m[1]);
    expect(new Set(weights)).toEqual(new Set(["400", "700"]));
  });

  it("declares each paper as a named page and maps it to the print copy", () => {
    for (const page of ["cv-a4", "cv-a4-compact", "cv-letter", "cv-letter-compact"]) {
      expect(CSS).toContain(`@page ${page}`);
      expect(CSS).toContain(`.cv-print-root.cv-page-${page.replace("cv-", "")} {\n  page: ${page};`);
    }
    expect(CSS).toMatch(/@page \{\s*size: A4/);
    expect(CSS).toMatch(/size: Letter/);
  });

  it("prints only the sheet, with no screen padding or shadow", () => {
    const print = CSS.slice(CSS.indexOf("@media print"));
    expect(print).toContain("body * {\n    visibility: hidden");
    expect(print).toContain(".cv-print-root,\n  .cv-print-root * {\n    visibility: visible");
    expect(print).toMatch(/padding:\s*0\s*!important/);
    expect(print).toMatch(/box-shadow:\s*none\s*!important/);
  });

  it("styles each of the four templates", () => {
    for (const template of TEMPLATE_IDS) expect(CSS).toContain(`.cv-sheet.cv-${template}`);
  });
});
