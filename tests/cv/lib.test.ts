// @vitest-environment jsdom
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { addItem, bulletsFromText, bulletsToText, moveItem, removeItem, setProfile, setSettings, updateItem } from "@/lib/cv/edit";
import { CV_FILE_FORMAT, cvFileName, cvToDocx, cvToHtml, cvToJson, cvToText, titleOf } from "@/lib/cv/export";
import { LIMITS, createCv, exampleCv, newExperience, newSkillGroup, type Cv } from "@/lib/cv/schema";
import { dateRange, headerOf, isWebUrl, sectionsOf, skillItems } from "@/lib/cv/sections";
import { CV_STORAGE_KEY, cleanCv, parseCvFile, readCvStore, writeCvStore, type CvStorage } from "@/lib/cv/storage";

const en = () => exampleCv("en");
const ru = () => exampleCv("ru");

describe("dateRange", () => {
  it("joins start and end, ends open with Present in the CV's language, and copes with gaps", () => {
    expect(dateRange("Mar 2022", "", true, "en")).toBe("Mar 2022 – Present");
    expect(dateRange("03.2022", "", true, "ru")).toBe("03.2022 – по настоящее время");
    expect(dateRange("2015", "2019", false, "en")).toBe("2015 – 2019");
    expect(dateRange("2019", "", false, "en")).toBe("2019");
    expect(dateRange("", "2019", false, "en")).toBe("2019");
    expect(dateRange("  ", "", false, "en")).toBe("");
    expect(dateRange("2020", "ignored", true, "en")).toBe("2020 – Present");
  });
});

describe("sectionsOf", () => {
  it("builds the standard sections in order, with the headings of the CV's language", () => {
    expect(sectionsOf(en()).map((s) => s.heading)).toEqual(["Summary", "Experience", "Education", "Skills"]);
    expect(sectionsOf(ru()).map((s) => s.heading)).toEqual(["О себе", "Опыт работы", "Образование", "Навыки"]);
  });

  it("leaves out empty sections and half-empty entries", () => {
    const cv = createCv("x");
    expect(sectionsOf(cv)).toEqual([]);
    const withEmpty: Cv = { ...cv, experiences: [newExperience()], skills: [newSkillGroup()] };
    expect(sectionsOf(withEmpty)).toEqual([]);
  });

  it("turns an experience into an entry with its dates and trimmed bullets", () => {
    const [, experience] = sectionsOf(en());
    expect(experience!.blocks[0]).toMatchObject({
      kind: "entry",
      title: "Senior engineer",
      subtitle: "Example Corp",
      place: "Austin, TX",
      dates: "Mar 2022 – Present",
    });
    expect(experience!.blocks).toHaveLength(2);
  });

  it("splits skills on commas, semicolons and newlines", () => {
    expect(skillItems("a, b;c\n d ,, ")).toEqual(["a", "b", "c", "d"]);
  });

  it("builds the header with only what is filled in", () => {
    expect(headerOf(en())).toMatchObject({ name: "Alex Morgan", headline: "Software engineer", contact: ["alex.morgan@example.com", "+1 555 010 0100", "Austin, TX"] });
    expect(headerOf(createCv("x")).contact).toEqual([]);
  });

  it("only links web addresses", () => {
    expect(isWebUrl("https://example.com/me")).toBe(true);
    expect(isWebUrl("http://x.org")).toBe(true);
    for (const bad of ["javascript:alert(1)", "example.com", "ftp://x", "https://a b", "", "data:text/html,x"]) expect(isWebUrl(bad)).toBe(false);
  });
});

describe("edit helpers", () => {
  it("edits the profile and settings without touching the original", () => {
    const cv = en();
    const next = setProfile(cv, { fullName: "Sam" });
    expect(next.profile.fullName).toBe("Sam");
    expect(cv.profile.fullName).toBe("Alex Morgan");
    expect(setSettings(cv, { template: "ats" }).settings.template).toBe("ats");
    expect(next.updated).toBeGreaterThanOrEqual(cv.updated);
  });

  it("adds, updates, moves and removes list items", () => {
    let cv = createCv("x");
    const a = newExperience();
    const b = newExperience();
    cv = addItem(cv, "experiences", a);
    cv = addItem(cv, "experiences", b);
    cv = updateItem(cv, "experiences", b.id, { role: "Second" });
    expect(cv.experiences.map((e) => e.role)).toEqual(["", "Second"]);
    cv = moveItem(cv, "experiences", b.id, -1);
    expect(cv.experiences.map((e) => e.id)).toEqual([b.id, a.id]);
    expect(moveItem(cv, "experiences", b.id, -1)).toBe(cv); // already first
    expect(moveItem(cv, "experiences", a.id, 1)).toBe(cv); // already last
    expect(moveItem(cv, "experiences", "nope", 1)).toBe(cv);
    cv = removeItem(cv, "experiences", a.id);
    expect(cv.experiences.map((e) => e.id)).toEqual([b.id]);
  });

  it("limits how many items a list can hold", () => {
    let cv = createCv("x");
    for (let i = 0; i < 40; i += 1) cv = addItem(cv, "experiences", newExperience());
    expect(cv.experiences).toHaveLength(30);
  });

  it("reads bullets one per line, dropping markers and blanks", () => {
    expect(bulletsFromText("- one\n• two\n  * three\n\n   \nfour")).toEqual(["one", "two", "three", "four"]);
    expect(bulletsToText(["a", "b"])).toBe("a\nb");
  });
});

describe("HTML export", () => {
  it("is structural and free of tables, images and styles", () => {
    const html = cvToHtml(en());
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    expect(doc.querySelector("h1")?.textContent).toBe("Alex Morgan");
    expect([...doc.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Summary", "Experience", "Education", "Skills"]);
    for (const tag of ["table", "img", "svg", "style", "script", "div", "span"]) expect(doc.querySelector(tag)).toBeNull();
    // The only inline extra is a link to a web address, and the address itself stays visible.
    for (const link of doc.querySelectorAll("a")) {
      expect(link.getAttribute("href")).toMatch(/^https?:\/\//);
      expect(link.textContent).toBe(link.getAttribute("href"));
    }
    expect(doc.querySelectorAll("ul li").length).toBe(3);
    // Reading order: name, headline, contact, then sections.
    expect([...doc.body.children].slice(0, 3).map((n) => n.tagName)).toEqual(["H1", "P", "P"]);
  });

  it("escapes anything typed", () => {
    const cv = setProfile(en(), { fullName: `<script>alert(1)</script> & "co"` });
    const html = cvToHtml(cv);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").querySelector("script")).toBeNull();
  });

  it("writes an entry line with the role in bold and the rest plain", () => {
    expect(cvToHtml(en())).toContain("<p><strong>Senior engineer</strong>, Example Corp, Austin, TX — Mar 2022 – Present</p>");
    expect(cvToHtml(en())).toContain("<p><strong>Languages:</strong> TypeScript, Python, SQL</p>");
  });
});

describe("DOCX export", () => {
  it("is a valid package whose text carries the whole CV", () => {
    const files = unzipSync(cvToDocx(en()));
    const xml = strFromU8(files["word/document.xml"]!);
    expect(xml).toContain("Alex Morgan");
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain("Experience");
    expect(xml).toContain("• Cut API response time by 40% by reworking the caching layer.");
    expect(xml).toContain("TypeScript, Python, SQL");
    expect(strFromU8(files["docProps/core.xml"]!)).toContain("Alex Morgan");
  });

  it("keeps Cyrillic intact", () => {
    const xml = strFromU8(unzipSync(cvToDocx(ru()))["word/document.xml"]!);
    expect(xml).toContain("Анна Петрова");
    expect(xml).toContain("Опыт работы");
  });
});

describe("text export", () => {
  it("is plain text with upper-case headings and dashed bullets", () => {
    const text = cvToText(en());
    expect(text.split("\n").slice(0, 3)).toEqual(["Alex Morgan", "Software engineer", "alex.morgan@example.com | +1 555 010 0100 | Austin, TX"]);
    expect(text).toContain("\nEXPERIENCE\n");
    expect(text).toContain("Senior engineer, Example Corp, Austin, TX — Mar 2022 – Present\n- Cut API response time");
    expect(text).toContain("Languages: TypeScript, Python, SQL");
    expect(text.endsWith("\n")).toBe(true);
    expect(cvToText(ru())).toContain("\nОПЫТ РАБОТЫ\n");
  });

  it("is empty-ish for an empty CV, without throwing", () => {
    expect(cvToText(createCv("x"))).toBe("\n");
  });
});

describe("file names and files", () => {
  it("names files after the person", () => {
    expect(cvFileName(en(), "docx")).toBe("Alex-Morgan-CV.docx");
    expect(cvFileName(ru(), "txt")).toBe("Анна-Петрова-CV.txt");
    expect(cvFileName(createCv("My CV: v2/draft"), "pdf")).toBe("My-CV-v2-draft-CV.pdf");
    expect(titleOf(createCv(""))).toBe("CV");
  });

  it("round-trips through a JSON file, as a new CV", () => {
    const cv = en();
    const text = cvToJson(cv);
    expect(JSON.parse(text)).toMatchObject({ format: CV_FILE_FORMAT, version: 1 });
    const back = parseCvFile(text)!;
    expect(back.profile).toEqual(cv.profile);
    expect(back.experiences).toEqual(cv.experiences);
    expect(back.id).not.toBe(cv.id);
  });

  it.each([["not json", "{no"], ["wrong format", JSON.stringify({ format: "x", cv: {} })], ["no cv", JSON.stringify({ format: CV_FILE_FORMAT })], ["array", "[]"]])("rejects %s", (_n, text) => {
    expect(parseCvFile(text)).toBeNull();
  });

  it("refuses a huge file", () => {
    expect(parseCvFile(" ".repeat(3 * 1024 * 1024))).toBeNull();
  });
});

describe("cleanCv and storage", () => {
  const memory = (initial?: unknown): CvStorage & { value: string | null } => ({
    value: initial === undefined ? null : typeof initial === "string" ? initial : JSON.stringify(initial),
    getItem() {
      return this.value;
    },
    setItem(_k, v) {
      this.value = v;
    },
  });

  it("uses a lab: key so the settings backup covers it", () => {
    expect(CV_STORAGE_KEY).toBe("lab:cv:v1");
  });

  it("round-trips CVs and the current one", () => {
    const [a, b] = [en(), ru()];
    const storage = memory();
    writeCvStore({ cvs: [a, b], current: b.id }, storage);
    const back = readCvStore(storage);
    expect(back.cvs.map((c) => c.name)).toEqual([a.name, b.name]);
    expect(back.cvs[0]!.experiences).toEqual(a.experiences);
    expect(back.current).toBe(b.id);
  });

  it("starts empty on missing or corrupt data and falls back to the first CV", () => {
    for (const bad of [undefined, "{no", "[]", "null", 4]) expect(readCvStore(memory(bad))).toEqual({ cvs: [], current: null });
    const store = readCvStore(memory({ cvs: [{ id: "a", name: "A" }, { id: "b" }], current: "zzz" }));
    expect(store.current).toBe("a");
    expect(store.cvs[1]!.name).toBe("CV");
  });

  it("bounds every field and list, repairs settings and ids", () => {
    const cv = cleanCv({
      id: "same",
      name: "x".repeat(500),
      profile: { fullName: "y".repeat(500), summary: "z".repeat(5000), email: 42 },
      experiences: Array.from({ length: 60 }, () => ({ id: "dup", role: "r", bullets: Array.from({ length: 40 }, (_, i) => ` b${i} `.repeat(300)) })),
      links: Array.from({ length: 20 }, () => ({ label: "l", url: "u".repeat(900) })),
      skills: [{ items: "s".repeat(2000) }],
      settings: { template: "fancy", paper: "tabloid", accent: "pink", density: "tiny", decorations: "no", lang: "fr" },
    });
    expect(cv.name).toHaveLength(LIMITS.name);
    expect(cv.profile.fullName).toHaveLength(LIMITS.field);
    expect(cv.profile.summary).toHaveLength(LIMITS.summary);
    expect(cv.profile.email).toBe("");
    expect(cv.experiences).toHaveLength(LIMITS.items);
    expect(new Set(cv.experiences.map((e) => e.id)).size).toBe(LIMITS.items);
    expect(cv.experiences[0]!.bullets).toHaveLength(LIMITS.bullets);
    expect(cv.experiences[0]!.bullets[0]!.length).toBeLessThanOrEqual(LIMITS.bullet);
    expect(cv.links).toHaveLength(LIMITS.links);
    expect(cv.links[0]!.url).toHaveLength(LIMITS.url);
    expect(cv.skills[0]!.items).toHaveLength(LIMITS.skillItems);
    expect(cv.settings).toMatchObject({ template: "classic", paper: "a4", accent: "blue", density: "normal", decorations: true, lang: "en" });
  });

  it("keeps valid settings and a Russian CV", () => {
    const cv = cleanCv({ settings: { template: "ats", paper: "letter", accent: "green", density: "compact", decorations: false, lang: "ru" } });
    expect(cv.settings).toEqual({ template: "ats", paper: "letter", accent: "green", density: "compact", decorations: false, lang: "ru" });
  });

  it("limits how many CVs are kept", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, name: `CV ${i}` }));
    expect(readCvStore(memory({ cvs: many })).cvs).toHaveLength(LIMITS.cvs);
  });

  it("never throws when storage refuses writes", () => {
    expect(() => writeCvStore({ cvs: [], current: null }, { getItem: () => null, setItem() { throw new Error("quota"); } })).not.toThrow();
  });
});
