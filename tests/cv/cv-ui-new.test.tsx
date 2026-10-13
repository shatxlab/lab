// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import CvApp from "@/components/cv/CvApp";
import { tcv } from "@/lib/cv/i18n";
import { exampleCv } from "@/lib/cv/schema";
import { readCvStore, writeCvStore } from "@/lib/cv/storage";
import { axeViolations, click, mount, type, waitFor } from "../helpers/dom";

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

const t = (key: Parameters<typeof tcv>[1], params?: Record<string, string | number>) => tcv("en", key, params);
const text = () => document.body.textContent ?? "";
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const byAria = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const sheet = () => document.querySelector<HTMLElement>(".cv-sheet")!;
const field = (label: string, within: ParentNode = document) =>
  [...within.querySelectorAll("label")].find((l) => l.firstChild?.textContent === label)?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement;
const store = () => readCvStore();
const current = () => store().cvs.find((cv) => cv.id === store().current)!;

async function open() {
  const view = await mount(<CvApp />);
  await waitFor(() => expect(sheet()).toBeTruthy());
  return view;
}
async function choose(label: string, value: string) {
  const el = [...document.querySelectorAll("select")].find((s) => s.closest("label")?.textContent?.startsWith(label))!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("CV builder — custom sections", () => {
  it("adds a section from a preset, adds entries, and shows it after Skills on the page", async () => {
    const view = await open();
    await click(button(t("example")));
    await choose(t("addSectionAs"), "Certifications");
    await click(button(t("addSection")));
    const heading = field(t("sectionHeading"));
    expect(heading.value).toBe("Certifications");
    await click(button(t("addEntry")));
    await type(field(t("entryTitle")), "AWS Solutions Architect");
    await type(field(t("entryDates")), "2021");
    await waitFor(() => expect([...sheet().querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Summary", "Experience", "Education", "Skills", "Certifications"]));
    expect(sheet().textContent).toContain("AWS Solutions Architect");
    await waitFor(() => expect(current().custom[0]).toMatchObject({ heading: "Certifications", entries: [{ title: "AWS Solutions Architect", dates: "2021" }] }));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });

  it("renames the heading, and a section of your own starts empty", async () => {
    const view = await open();
    await click(button(t("example")));
    await click(button(t("addSection")));
    expect(field(t("sectionHeading")).value).toBe("");
    await type(field(t("sectionHeading")), "Talks");
    await click(button(t("addEntry")));
    await type(field(t("entryTitle")), "Keynote");
    await waitFor(() => expect(sheet().textContent).toContain("Talks"));
    view.unmount();
  });

  it("offers presets in the CV's own language, and removes a section", async () => {
    const view = await open();
    await click(button(t("example")));
    await choose(t("language"), "ru");
    const options = [...document.querySelectorAll("select")].find((s) => s.closest("label")?.textContent?.startsWith(t("addSectionAs")))!.textContent;
    expect(options).toContain("Сертификаты");
    await click(button(t("addSection")));
    expect(store().cvs[0]!.custom).toHaveLength(1);
    await click(byAria(`${t("remove")}: ${t("item", { what: t("oneSection"), n: 1 })}`));
    await waitFor(() => expect(current().custom).toHaveLength(0));
    view.unmount();
  });

  it("moves sections and entries with the up and down buttons", async () => {
    const cv = { ...exampleCv("en") };
    writeCvStore({
      cvs: [
        {
          ...cv,
          custom: [
            { id: "s1", heading: "First", entries: [{ id: "e1", title: "A", subtitle: "", dates: "", bullets: [] }, { id: "e2", title: "B", subtitle: "", dates: "", bullets: [] }] },
            { id: "s2", heading: "Second", entries: [{ id: "e3", title: "C", subtitle: "", dates: "", bullets: [] }] },
          ],
        },
      ],
      current: cv.id,
    });
    const view = await open();
    await click(byAria(`${t("moveDown")}: ${t("item", { what: t("oneSection"), n: 1 })}`));
    await waitFor(() => expect(current().custom.map((s) => s.id)).toEqual(["s2", "s1"]));
    // Sections are now Second, First: the second "Entry 1" belongs to First (the first is Second's only entry).
    const down = document.querySelectorAll<HTMLButtonElement>(`button[aria-label="${t("moveDown")}: ${t("item", { what: t("oneEntry"), n: 1 })}"]`);
    expect(down).toHaveLength(2);
    expect(down[0]!.disabled).toBe(true);
    await click(down[1]);
    await waitFor(() => expect(current().custom.find((s) => s.id === "s1")!.entries.map((e) => e.id)).toEqual(["e2", "e1"]));
    view.unmount();
  });
});

describe("CV builder — drag to reorder", () => {
  /** Lay the cards of the first list out one under another, as a real page would. */
  function layout(cards: HTMLElement[], top = 0, height = 100) {
    cards.forEach((card, i) => {
      card.getBoundingClientRect = () => ({ top: top + i * height, height, bottom: top + (i + 1) * height, left: 0, right: 300, width: 300, x: 0, y: top + i * height, toJSON: () => ({}) }) as DOMRect;
    });
  }
  const pointer = (target: EventTarget, type: string, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: y, button: 0 });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    return act(async () => void target.dispatchEvent(event));
  };
  const jobCards = () => [...document.querySelectorAll<HTMLElement>("fieldset")].filter((f) => f.querySelector("legend")?.textContent?.startsWith(`${t("oneJob")}`));
  const handleOf = (card: HTMLElement) => card.querySelector<HTMLElement>('span[aria-hidden="true"][title]')!;

  async function twoJobs() {
    const cv = exampleCv("en");
    cv.experiences.push({ ...cv.experiences[0]!, id: "third", role: "Third role" });
    writeCvStore({ cvs: [cv], current: cv.id });
    return open();
  }

  it("moves an entry to where it is dropped, and shows where it will land", async () => {
    const view = await twoJobs();
    const before = current().experiences.map((e) => e.role);
    expect(before).toHaveLength(3);
    const cards = jobCards();
    layout(cards);
    // Pick up the first card and move the pointer to below the second card's middle.
    await pointer(handleOf(cards[0]!), "pointerdown", 50);
    await pointer(window, "pointermove", 160);
    expect(cards[0]!.className).toContain("opacity-60");
    expect(cards[1]!.className).toContain("border-b-4");
    await pointer(window, "pointerup", 160);
    await waitFor(() => expect(current().experiences.map((e) => e.role)).toEqual([before[1], before[0], before[2]]));
    expect(cards[0]!.className).not.toContain("opacity-60");
    view.unmount();
  });

  it("moves an entry to the top, and does nothing when dropped where it started", async () => {
    const view = await twoJobs();
    const before = current().experiences.map((e) => e.role);
    const cards = jobCards();
    layout(cards);
    await pointer(handleOf(cards[2]!), "pointerdown", 250);
    await pointer(window, "pointermove", 5);
    expect(cards[0]!.className).toContain("border-t-4");
    await pointer(window, "pointerup", 5);
    await waitFor(() => expect(current().experiences.map((e) => e.role)).toEqual([before[2], before[0], before[1]]));

    const again = jobCards();
    layout(again);
    const order = current().experiences.map((e) => e.role);
    await pointer(handleOf(again[1]!), "pointerdown", 150);
    await pointer(window, "pointermove", 152);
    await pointer(window, "pointerup", 152);
    expect(current().experiences.map((e) => e.role)).toEqual(order);
    view.unmount();
  });

  it("cancels cleanly, and stops listening once finished", async () => {
    const view = await twoJobs();
    const before = current().experiences.map((e) => e.role);
    const cards = jobCards();
    layout(cards);
    await pointer(handleOf(cards[0]!), "pointerdown", 50);
    await pointer(window, "pointermove", 250);
    await pointer(window, "pointercancel", 250);
    expect(cards[0]!.className).not.toContain("opacity-60");
    expect(current().experiences.map((e) => e.role)).toEqual(before);
    await pointer(window, "pointermove", 10);
    await pointer(window, "pointerup", 10);
    expect(current().experiences.map((e) => e.role)).toEqual(before);
    view.unmount();
  });

  it("is not the only way: the handle is hidden from assistive technology and the buttons remain", async () => {
    const view = await twoJobs();
    const card = jobCards()[0]!;
    expect(handleOf(card).getAttribute("aria-hidden")).toBe("true");
    expect(card.querySelector(`button[aria-label^="${t("moveDown")}"]`)).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });
});

describe("CV builder — import from pasted text", () => {
  const SAMPLE = "Jo Park\njo@example.com\n\nEXPERIENCE\nEngineer, Acme   2020 – 2022\n- Built things\n\nSKILLS\nGo, Rust\n";
  const area = () => [...document.querySelectorAll("textarea")].find((a) => a.closest("label")?.textContent?.startsWith(t("importTextLabel"))) as HTMLTextAreaElement;

  it("shows what it found and creates a new CV, leaving the current one alone", async () => {
    const view = await open();
    await type(area(), SAMPLE);
    await waitFor(() => expect(text()).toContain(t("foundJobs", { n: 1 })));
    expect(text()).toContain(t("foundName", { name: "Jo Park" }));
    expect(text()).toContain(t("foundSkills", { n: 1 }));
    expect(text()).toContain(t("importCheck"));
    await click(button(t("importCreate")));
    await waitFor(() => expect(store().cvs).toHaveLength(2));
    expect(current().profile).toMatchObject({ fullName: "Jo Park", email: "jo@example.com" });
    expect(current().experiences[0]).toMatchObject({ role: "Engineer", company: "Acme", start: "2020", end: "2022", bullets: ["Built things"] });
    expect(current().name).toBe("Jo Park");
    expect(text()).toContain(t("importedFromText", { name: "Jo Park" }));
    expect(sheet().querySelector("h1")!.textContent).toBe("Jo Park");
    // The first CV is untouched.
    expect(store().cvs[0]!.profile.fullName).toBe("");
    view.unmount();
  });

  it("says so when the text is not a CV, and offers nothing to create", async () => {
    const view = await open();
    await type(area(), "hello there");
    await waitFor(() => expect(text()).toContain(t("foundNothing")));
    expect(button(t("importCreate"))).toBeUndefined();
    view.unmount();
  });

  it("takes a text file", async () => {
    const view = await open();
    const input = document.querySelector<HTMLInputElement>('details input[type="file"][accept*=".txt"]')!;
    Object.defineProperty(input, "files", { value: [new File([SAMPLE], "old-cv.txt", { type: "text/plain" })], configurable: true });
    await act(async () => void input.dispatchEvent(new Event("change", { bubbles: true })));
    await waitFor(() => expect(text()).toContain(t("foundJobs", { n: 1 })));
    view.unmount();
  });

  it("is accessible", async () => {
    const view = await open();
    await type(area(), SAMPLE);
    await waitFor(() => expect(text()).toContain(t("foundJobs", { n: 1 })));
    expect(await axeViolations()).toEqual([]);
    view.unmount();
  });
});
