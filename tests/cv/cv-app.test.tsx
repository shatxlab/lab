// @vitest-environment jsdom
import { strFromU8, unzipSync } from "fflate";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CvApp from "@/components/cv/CvApp";
import { cvToJson } from "@/lib/cv/export";
import { tcv } from "@/lib/cv/i18n";
import { createCv, exampleCv } from "@/lib/cv/schema";
import { CV_STORAGE_KEY, readCvStore, writeCvStore } from "@/lib/cv/storage";
import { axeViolations, click, mount, press, type, waitFor } from "../helpers/dom";

const saved = vi.hoisted(() => ({ calls: [] as { blob: Blob; name: string }[], printed: 0, titles: [] as string[] }));
vi.mock("@/lib/apps/file-open", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/apps/file-open")>();
  return { ...actual, saveBlob: (blob: Blob, name: string) => void saved.calls.push({ blob, name }) };
});
vi.mock("@/lib/viewer/print", () => ({
  printDocument: (title: string) => {
    saved.printed += 1;
    saved.titles.push(title);
  },
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  saved.calls = [];
  saved.printed = 0;
  saved.titles = [];
});

const text = () => document.body.textContent ?? "";
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const t = (key: Parameters<typeof tcv>[1], params?: Record<string, string | number>) => tcv("en", key, params);
const sheet = () => document.querySelector<HTMLElement>(".cv-sheet")!;
const field = (label: string) =>
  [...document.querySelectorAll("label")].find((l) => l.firstChild?.textContent === label || l.textContent?.startsWith(label))?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement;
const select = (label: string) => [...document.querySelectorAll("select")].find((s) => s.closest("label")?.textContent?.startsWith(label))!;
async function choose(label: string, value: string) {
  const el = select(label);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const store = () => readCvStore();

async function open() {
  const view = await mount(<CvApp />);
  await waitFor(() => expect(sheet()).toBeTruthy());
  return view;
}

describe("CV builder — first use", () => {
  it("starts with one empty CV and offers an example, accessibly", async () => {
    const view = await open();
    expect(text()).toContain(t("emptyHint"));
    expect(document.querySelector("select")!.textContent).toContain("My CV 1");
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("fills in an example, which shows in the form and the page", async () => {
    const view = await open();
    await click(button(t("example")));
    expect(field(t("fullName")).value).toBe("Alex Morgan");
    expect(sheet().querySelector("h1")!.textContent).toBe("Alex Morgan");
    expect(text()).not.toContain(t("emptyHint"));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });
});

describe("CV builder — editing", () => {
  it("updates the page as you type, and saves under lab:cv:v1", async () => {
    const view = await open();
    await type(field(t("fullName")), "Sam Lee");
    await type(field(t("headline")), "Designer");
    await type(field(t("email")), "sam@example.com");
    expect(sheet().querySelector("h1")!.textContent).toBe("Sam Lee");
    expect(sheet().textContent).toContain("Designer");
    expect(sheet().textContent).toContain("sam@example.com");
    await waitFor(() => expect(store().cvs[0]!.profile.fullName).toBe("Sam Lee"));
    expect(localStorage.getItem(CV_STORAGE_KEY)).toContain("Sam Lee");
    view.unmount();
  });

  it("adds a job, with bullets typed one per line, and shows it in the section", async () => {
    const view = await open();
    await click(button(t("addExperience")));
    await type(field(t("role")), "Engineer");
    await type(field(t("company")), "Acme");
    await type(field(t("start")), "2020");
    await type(field(t("end")), "2022");
    const bullets = field(t("bullets")) as HTMLTextAreaElement;
    await type(bullets, "Built things\n\n- Fixed things\nShipped things");
    expect(sheet().querySelector("h2")!.textContent).toBe("Experience");
    expect(sheet().textContent).toContain("Engineer");
    expect(sheet().textContent).toContain("Acme");
    expect(sheet().textContent).toContain("2020 – 2022");
    expect([...sheet().querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Built things", "Fixed things", "Shipped things"]);
    // The text area keeps what was typed, blank line and all.
    expect(bullets.value).toBe("Built things\n\n- Fixed things\nShipped things");
    view.unmount();
  });

  it("says Present for a current job and disables its end date", async () => {
    const view = await open();
    await click(button(t("addExperience")));
    await type(field(t("role")), "Lead");
    await type(field(t("start")), "Jan 2023");
    await click(field(t("current")));
    expect(sheet().textContent).toContain("Jan 2023 – Present");
    expect(field(t("end")).disabled).toBe(true);
    view.unmount();
  });

  it("moves jobs up and down and removes them", async () => {
    const view = await open();
    await click(button(t("example")));
    const titles = () => [...sheet().querySelectorAll("section:nth-of-type(2) .cv-title")].map((n) => n.textContent);
    expect(titles()).toEqual(["Senior engineer", "Engineer"]);
    await click(document.querySelector('button[aria-label="Move down: Job 1"]'));
    expect(titles()).toEqual(["Engineer", "Senior engineer"]);
    expect((document.querySelector('button[aria-label="Move down: Job 2"]') as HTMLButtonElement).disabled).toBe(true);
    await click(document.querySelector('button[aria-label="Remove: Job 1"]'));
    expect(titles()).toEqual(["Senior engineer"]);
    view.unmount();
  });

  it("builds skills groups, links and projects", async () => {
    const view = await open();
    await click(button(t("addSkills")));
    await type(field(t("skillLabel")), "Tools");
    await type(field(t("skillItems")), "Git, Docker");
    expect(sheet().textContent).toContain("Tools: Git, Docker");
    await click(button(t("addLink")));
    await type(field(t("linkLabel")), "Site");
    await type(field(t("linkUrl")), "https://example.com");
    expect(sheet().querySelector("a")!.getAttribute("href")).toBe("https://example.com");
    await click(button(t("addProject")));
    await type(field(t("projectName")), "Thing");
    expect(sheet().textContent).toContain("Projects");
    view.unmount();
  });
});

describe("CV builder — design", () => {
  it("switches template, paper, density and decorations, and the print copy follows", async () => {
    const view = await open();
    await click(button(t("example")));
    await choose(t("template"), "ats");
    expect(sheet().classList.contains("cv-ats")).toBe(true);
    await choose(t("paper"), "letter");
    expect(sheet().classList.contains("cv-letter")).toBe(true);
    await choose(t("density"), "compact");
    expect(sheet().classList.contains("cv-compact")).toBe(true);
    await click(field(t("decorations")));
    expect(sheet().classList.contains("cv-plain")).toBe(true);
    const print = document.querySelector('[data-testid="cv-print"]')!;
    expect(print.classList.contains("cv-page-letter-compact")).toBe(true);
    expect(print.querySelector(".cv-sheet")!.classList.contains("cv-ats")).toBe(true);
    await waitFor(() => expect(store().cvs[0]!.settings).toMatchObject({ template: "ats", paper: "letter", density: "compact", decorations: false }));
    view.unmount();
  });

  it("changes the language of the CV's headings without changing the interface", async () => {
    const view = await open();
    await click(button(t("example")));
    await choose(t("language"), "ru");
    expect([...sheet().querySelectorAll("h2")].map((h) => h.textContent)).toContain("Опыт работы");
    expect(sheet().textContent).toContain("Mar 2022 – по настоящее время");
    expect(text()).toContain(t("design"));
    view.unmount();
  });

  it("picks an accent colour", async () => {
    const view = await open();
    await click(document.querySelector(`button[aria-label="${t("accentGreen")}"]`));
    expect(sheet().style.getPropertyValue("--cv-accent")).toBe("#1b6b3a");
    view.unmount();
  });
});

describe("CV builder — several CVs", () => {
  it("creates, duplicates, renames, switches and deletes with confirmation", async () => {
    const view = await open();
    await click(button(t("example")));
    await click(button(t("duplicate")));
    await waitFor(() => expect(store().cvs).toHaveLength(2));
    expect(store().cvs[1]!.name).toBe("My CV 1 (copy)");
    expect(store().cvs[1]!.id).not.toBe(store().cvs[0]!.id);
    expect(sheet().querySelector("h1")!.textContent).toBe("Alex Morgan");

    await click(button(t("newCv")));
    await waitFor(() => expect(store().cvs).toHaveLength(3));
    expect(sheet().querySelector("h1")).toBeNull();

    await click(button(t("rename")));
    await type(document.querySelector<HTMLInputElement>('input[maxlength="120"]'), "For Acme");
    await click(button(t("save")));
    await waitFor(() => expect(store().cvs[2]!.name).toBe("For Acme"));

    await click(button(t("deleteCv")));
    expect(text()).toContain(t("deleteAsk", { name: "For Acme" }));
    await click(button(t("keep")));
    expect(store().cvs).toHaveLength(3);
    await click(button(t("deleteCv")));
    await click(button(t("deleteYes")));
    await waitFor(() => expect(store().cvs).toHaveLength(2));
    view.unmount();
  });
});

describe("CV builder — taking it away", () => {
  it("prints the sheet, titled with the person's name", async () => {
    const view = await open();
    await click(button(t("example")));
    await click(button(t("print")));
    expect(saved.printed).toBe(1);
    expect(saved.titles).toEqual(["Alex Morgan"]);
    view.unmount();
  });

  it("downloads a real Word file whose text is the CV", async () => {
    const view = await open();
    await click(button(t("example")));
    await click(button(t("docx")));
    expect(saved.calls[0]!.name).toBe("Alex-Morgan-CV.docx");
    const xml = strFromU8(unzipSync(new Uint8Array(await saved.calls[0]!.blob.arrayBuffer()))["word/document.xml"]!);
    expect(xml).toContain("Alex Morgan");
    expect(xml).toContain("Experience");
    view.unmount();
  });

  it("downloads plain text and a CV file that reads back", async () => {
    const view = await open();
    await click(button(t("example")));
    await click(button(t("text")));
    expect(saved.calls[0]!.name).toBe("Alex-Morgan-CV.txt");
    expect(await saved.calls[0]!.blob.text()).toContain("\nEXPERIENCE\n");
    await click(button(t("json")));
    const parsed = JSON.parse(await saved.calls[1]!.blob.text());
    expect(parsed).toMatchObject({ format: "lab-cv", version: 1 });
    expect(parsed.cv.profile.fullName).toBe("Alex Morgan");
    view.unmount();
  });

  it("opens a CV file as a new CV, and refuses anything else", async () => {
    const view = await open();
    const give = async (contents: string) => {
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(input, "files", { value: [new File([contents], "cv.json", { type: "application/json" })], configurable: true });
      await act(async () => {
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };
    await give(cvToJson(exampleCv("ru")));
    await waitFor(() => expect(store().cvs).toHaveLength(2));
    expect(sheet().querySelector("h1")!.textContent).toBe("Анна Петрова");
    expect(text()).toContain(t("imported", { name: "Пример резюме" }));
    await give("nonsense");
    await waitFor(() => expect(text()).toContain(t("importFailed")));
    expect(store().cvs).toHaveLength(2);
    view.unmount();
  });
});

describe("CV builder — persistence, tabs and language", () => {
  it("comes back as it was", async () => {
    const first = await open();
    await type(field(t("fullName")), "Persisted Person");
    await waitFor(() => expect(store().cvs[0]!.profile.fullName).toBe("Persisted Person"));
    first.unmount();
    document.body.innerHTML = "";
    const second = await open();
    expect(field(t("fullName")).value).toBe("Persisted Person");
    expect(sheet().querySelector("h1")!.textContent).toBe("Persisted Person");
    second.unmount();
  });

  it("shows the edit form or the page on a narrow screen, by tabs", async () => {
    const view = await open();
    const editPanel = document.getElementById("cv-view-panel-edit")!;
    const previewPanel = document.getElementById("cv-view-panel-preview")!;
    expect(editPanel.className).not.toContain("max-lg:hidden");
    expect(previewPanel.className).toContain("max-lg:hidden");
    await click(document.getElementById("cv-view-tab-preview"));
    expect(editPanel.className).toContain("max-lg:hidden");
    expect(previewPanel.className).not.toContain("max-lg:hidden");
    await press(document.getElementById("cv-view-tab-preview")!, "Home");
    expect(editPanel.className).not.toContain("max-lg:hidden");
    view.unmount();
  });

  it("starts a new Russian-speaking user with a Russian CV", async () => {
    localStorage.setItem("lab:lang", "ru");
    const view = await open();
    expect(text()).toContain(tcv("ru", "title"));
    await waitFor(() => expect(store().cvs.length).toBe(0)); // nothing saved until something changes
    await click(button(tcv("ru", "example")));
    expect(sheet().querySelector("h1")!.textContent).toBe("Анна Петрова");
    expect([...sheet().querySelectorAll("h2")].map((h) => h.textContent)).toContain("Опыт работы");
    view.unmount();
  });

  it("reads an old store with other CVs in it", async () => {
    const a = createCv("Old one");
    const b = { ...createCv("Second"), profile: { ...createCv("x").profile, fullName: "Second Person" } };
    writeCvStore({ cvs: [a, b], current: b.id });
    const view = await open();
    expect(sheet().querySelector("h1")!.textContent).toBe("Second Person");
    expect([...document.querySelector("select")!.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Old one", "Second"]);
    view.unmount();
  });
});
