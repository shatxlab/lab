// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { cvToDocx, cvToHtml, cvToText } from "@/lib/cv/export";
import { addCustomEntry, removeCustomEntry, reorderCustomEntry, reorderItem, updateCustomEntry } from "@/lib/cv/edit";
import { targetIndex } from "@/lib/cv/drag";
import { detectLang, extractDates, blocksOf, importCvText } from "@/lib/cv/import";
import { createCv, exampleCv, newCustomEntry, newCustomSection, newExperience } from "@/lib/cv/schema";
import { sectionsOf } from "@/lib/cv/sections";
import { cleanCv, parseCvFile } from "@/lib/cv/storage";
import { cvToJson } from "@/lib/cv/export";
import { unzipSync, strFromU8 } from "fflate";

const EN = `Alex Morgan
Senior Software Engineer
alex.morgan@example.com | +1 555 010 0100 | Austin, TX
linkedin.com/in/alexmorgan  github.com/alexm

SUMMARY
Engineer with six years of experience building web services. I like simple designs.

EXPERIENCE
Senior Engineer, Example Corp, Austin, TX        Mar 2022 – Present
- Cut API response time by 40% by reworking caching
- Led a team of four

Engineer at Sample Ltd | Remote
Jun 2019 - Feb 2022
• Built a notifications service
  used by 200,000 people

EDUCATION
BSc Computer Science, Example University, Austin, TX   2015 – 2019

SKILLS
Languages: TypeScript, Python, SQL
Tools: Git, Docker

CERTIFICATIONS
AWS Solutions Architect — 2021
PUBLIC SPEAKING
Talk at Conf 2020
`;

const RU = `Анна Петрова
Инженер-программист
Москва, Россия
anna@example.com
+7 900 000-00-00

О себе
Инженер с шестилетним опытом.

Опыт работы
Ведущий разработчик
ООО «Пример» · Полная занятость
03.2022 — по настоящее время
Москва
Сократила время отклика API на 40%.
Руководила командой.

Разработчик
АО «Образец»
06.2019 – 02.2022
Разработала сервис уведомлений.

Образование
Университет «Пример»
Бакалавр, прикладная математика
2015 – 2019

Навыки
TypeScript, Python, SQL
Git; Docker

Языки
Английский — B2
`;

describe("reading dates", () => {
  it("finds ranges in several styles, and 'present' in both languages", () => {
    expect(extractDates("Engineer, Acme   Mar 2022 – Present")).toMatchObject({ start: "Mar 2022", end: "", current: true, rest: "Engineer, Acme" });
    expect(extractDates("2015 - 2019 | Example University")).toMatchObject({ start: "2015", end: "2019", current: false, rest: "Example University" });
    expect(extractDates("03.2022 — по настоящее время")).toMatchObject({ start: "03.2022", current: true, rest: "" });
    expect(extractDates("June 2019 to February 2022")).toMatchObject({ start: "June 2019", end: "February 2022" });
    expect(extractDates("янв 2020 – дек 2021")).toMatchObject({ start: "янв 2020", end: "дек 2021" });
    expect(extractDates("(2018 – now)")).toMatchObject({ start: "2018", current: true, rest: "" });
  });

  it("finds no range where there is none", () => {
    expect(extractDates("Just a title")).toEqual({ start: "", end: "", current: false, rest: "Just a title" });
    expect(extractDates("In 2019 we shipped")).toMatchObject({ start: "" });
  });

  it("tells Russian from English by its letters", () => {
    expect(detectLang(RU)).toBe("ru");
    expect(detectLang(EN)).toBe("en");
    expect(detectLang("")).toBe("en");
    expect(detectLang("123 456")).toBe("en");
    expect(detectLang("Мой CV with some English words but mostly Latin letters here")).toBe("en");
  });
});

describe("splitting a section into entries", () => {
  it("starts a new entry after a blank line and gathers bullets, marked or not", () => {
    const blocks = blocksOf(["Role", "Company", "2020 – 2021", "- one", "- two", "", "Role 2", "Co 2", "Did a thing.", "Did another."]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ header: ["Role", "Company", "2020 – 2021"], bullets: ["one", "two"] });
    // Without markers each line is a point of its own.
    expect(blocks[1]).toMatchObject({ header: ["Role 2", "Co 2"], bullets: ["Did a thing.", "Did another."] });
  });

  it("joins a wrapped line to the bullet before it, and starts a new entry at a dated line", () => {
    const blocks = blocksOf(["Role A", "• a long point", "  continued here", "Role B   2019 – 2020", "• point"]);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.bullets).toEqual(["a long point continued here"]);
    expect(blocks[1]!.header).toEqual(["Role B   2019 – 2020"]);
  });

  it("copes with empty input and leading bullets", () => {
    expect(blocksOf([])).toEqual([]);
    expect(blocksOf(["", "  "])).toEqual([]);
    expect(blocksOf(["- only a point"])).toEqual([{ header: [], bullets: ["only a point"], marked: true }]);
  });
});

describe("importing an English CV", () => {
  const { cv, found, empty } = importCvText(EN);

  it("reads the header: name, headline, contact details and links", () => {
    expect(cv.profile).toMatchObject({ fullName: "Alex Morgan", headline: "Senior Software Engineer", email: "alex.morgan@example.com", phone: "+1 555 010 0100", location: "Austin, TX" });
    expect(cv.links).toMatchObject([{ label: "LinkedIn", url: "https://linkedin.com/in/alexmorgan" }, { label: "GitHub", url: "https://github.com/alexm" }]);
    expect(cv.name).toBe("Alex Morgan");
    expect(cv.settings.lang).toBe("en");
  });

  it("reads the summary and each job, with dates, place and bullets", () => {
    expect(cv.profile.summary).toContain("six years");
    expect(cv.experiences).toMatchObject([
      { role: "Senior Engineer", company: "Example Corp", location: "Austin, TX", start: "Mar 2022", end: "", current: true, bullets: ["Cut API response time by 40% by reworking caching", "Led a team of four"] },
      { role: "Engineer", company: "Sample Ltd", location: "Remote", start: "Jun 2019", end: "Feb 2022", current: false, bullets: ["Built a notifications service used by 200,000 people"] },
    ]);
  });

  it("reads education, skills and other sections", () => {
    expect(cv.education).toMatchObject([{ school: "Example University", degree: "BSc Computer Science", location: "Austin, TX", start: "2015", end: "2019" }]);
    expect(cv.skills).toMatchObject([{ label: "Languages", items: "TypeScript, Python, SQL" }, { label: "Tools", items: "Git, Docker" }]);
    expect(cv.custom.map((section) => section.heading)).toEqual(["Certifications", "Public speaking"]);
    expect(cv.custom[0]!.entries[0]).toMatchObject({ title: "AWS Solutions Architect", dates: "2021" });
    expect(cv.custom[1]!.entries[0]).toMatchObject({ title: "Talk", subtitle: "Conf", dates: "2020" });
  });

  it("counts what it found, and does not call it empty", () => {
    expect(found).toEqual({ name: true, contact: 3, links: 2, jobs: 2, schools: 1, projects: 0, skillGroups: 2, customSections: 2 });
    expect(empty).toBe(false);
  });

  it("makes a CV that renders: sections in order, nothing dropped", () => {
    expect(sectionsOf(cv).map((section) => section.heading)).toEqual(["Summary", "Experience", "Education", "Skills", "Certifications", "Public speaking"]);
    expect(cvToText(cv)).toContain("CERTIFICATIONS");
  });
});

describe("importing a Russian CV", () => {
  const { cv } = importCvText(RU);

  it("detects the language and reads the header", () => {
    expect(cv.settings.lang).toBe("ru");
    expect(cv.profile).toMatchObject({ fullName: "Анна Петрова", headline: "Инженер-программист", email: "anna@example.com", location: "Москва, Россия" });
  });

  it("reads jobs, with 'по настоящее время', a place on its own line and unmarked sentences as points", () => {
    expect(cv.experiences[0]).toMatchObject({ role: "Ведущий разработчик", company: "ООО «Пример»", location: "Москва", start: "03.2022", current: true, bullets: ["Сократила время отклика API на 40%.", "Руководила командой."] });
    expect(cv.experiences[1]).toMatchObject({ role: "Разработчик", company: "АО «Образец»", start: "06.2019", end: "02.2022" });
  });

  it("recognises a Cyrillic university, and keeps the writer's own heading for a custom section", () => {
    expect(cv.education[0]).toMatchObject({ school: "Университет «Пример»", degree: "Бакалавр, прикладная математика", start: "2015", end: "2019" });
    expect(cv.custom[0]!.heading).toBe("Языки");
    expect(cv.skills[0]!.items).toBe("TypeScript, Python, SQL, Git, Docker");
  });
});

describe("importing awkward text", () => {
  it("says it is empty when nothing looks like a CV", () => {
    expect(importCvText("").empty).toBe(true);
    expect(importCvText("   \n \n").empty).toBe(true);
    expect(importCvText("12345 67890").empty).toBe(true);
  });

  it("takes a header-only paste, a CV with no headings, and keeps long sentences as the summary", () => {
    const { cv } = importCvText("Sam Lee\nsam@example.com\n555 123 4567\nBackend developer who enjoys building reliable systems for large teams across several time zones.");
    expect(cv.profile).toMatchObject({ fullName: "Sam Lee", email: "sam@example.com" });
    expect(cv.profile.summary).toContain("reliable systems");
  });

  it("does not take a person's name in capitals for a heading", () => {
    const { cv } = importCvText("ALEX MORGAN\nalex@example.com\n\nEXPERIENCE\nEngineer, Acme   2020 – 2021");
    expect(cv.profile.fullName).toBe("ALEX MORGAN");
    expect(cv.experiences).toHaveLength(1);
  });

  it("strips markers and zero-width characters, and survives Windows line endings and tabs", () => {
    const { cv } = importCvText("Jo Park\r\n\r\nSkills\r\n​• Go\r\n• Rust\r\n");
    expect(cv.skills[0]!.items).toBe("Go, Rust");
  });

  it("limits what it takes, however big the paste", () => {
    const jobs = Array.from({ length: 80 }, (_, i) => `Role ${i}, Co ${i}   2020 – 2021\n- did something\n`).join("\n");
    const { cv } = importCvText(`Big Person\n\nExperience\n${jobs}`);
    expect(cv.experiences.length).toBeLessThanOrEqual(30);
    const huge = importCvText(`Name\n${"x".repeat(200_000)}`);
    expect(huge.cv.profile.summary.length).toBeLessThanOrEqual(2000);
  });

  it("gives each import its own id, and never shares the example's", () => {
    expect(importCvText(EN).cv.id).not.toBe(importCvText(EN).cv.id);
  });
});

describe("custom sections", () => {
  const base = () => {
    const cv = createCv("T");
    cv.profile.fullName = "Pat";
    return cv;
  };

  it("appear after Skills with the heading the writer chose, and only when they have content", () => {
    let cv = exampleCv("en");
    const section = newCustomSection("Awards");
    cv = { ...cv, custom: [section, newCustomSection("Empty one"), { ...newCustomSection(""), entries: [{ ...newCustomEntry(), title: "No heading" }] }] };
    expect(sectionsOf(cv).map((s) => s.heading)).not.toContain("Awards");
    cv = addCustomEntry(cv, section.id, { ...newCustomEntry(), title: "Best Engineer", subtitle: "Acme", dates: "2021", bullets: ["For shipping early"] });
    const sections = sectionsOf(cv);
    expect(sections.at(-1)).toMatchObject({ heading: "Awards" });
    expect(sections.map((s) => s.heading)).toEqual(["Summary", "Experience", "Education", "Skills", "Awards"]);
    expect(sections.at(-1)!.id).toBe(`custom:${section.id}`);
    expect(sections.at(-1)!.blocks[0]).toMatchObject({ kind: "entry", title: "Best Engineer", subtitle: "Acme", dates: "2021", bullets: ["For shipping early"] });
  });

  it("edits, reorders and removes entries", () => {
    const section = newCustomSection("Languages");
    let cv = { ...base(), custom: [section] };
    const [a, b, c] = [newCustomEntry(), newCustomEntry(), newCustomEntry()];
    for (const entry of [a, b, c]) cv = addCustomEntry(cv, section.id, entry);
    cv = updateCustomEntry(cv, section.id, b.id, { title: "French" });
    expect(cv.custom[0]!.entries.map((e) => e.id)).toEqual([a.id, b.id, c.id]);
    cv = reorderCustomEntry(cv, section.id, c.id, 0);
    expect(cv.custom[0]!.entries.map((e) => e.id)).toEqual([c.id, a.id, b.id]);
    expect(reorderCustomEntry(cv, section.id, c.id, 0)).toBe(cv);
    cv = removeCustomEntry(cv, section.id, a.id);
    expect(cv.custom[0]!.entries.map((e) => e.id)).toEqual([c.id, b.id]);
    expect(addCustomEntry(cv, section.id, newCustomEntry(), 2).custom[0]!.entries).toHaveLength(2);
  });

  it("export to text, HTML and Word like any other section", () => {
    const section = { ...newCustomSection("Certifications"), entries: [{ ...newCustomEntry(), title: "AWS SA", dates: "2021" }] };
    const cv = { ...exampleCv("en"), custom: [section] };
    expect(cvToText(cv)).toContain("CERTIFICATIONS\nAWS SA, 2021");
    expect(cvToHtml(cv)).toContain("<h2>Certifications</h2>");
    const xml = strFromU8(unzipSync(cvToDocx(cv))["word/document.xml"]!);
    expect(xml).toContain("Certifications");
    expect(xml).toContain("AWS SA");
  });

  it("survive saving and a file round trip, bounded", () => {
    const section = { ...newCustomSection("Awards"), entries: [{ ...newCustomEntry(), title: "Prize", bullets: ["x"] }] };
    const cv = { ...base(), custom: [section] };
    expect(cleanCv(JSON.parse(JSON.stringify(cv))).custom).toEqual(cv.custom);
    expect(parseCvFile(cvToJson(cv))!.custom[0]).toMatchObject({ heading: "Awards", entries: [{ title: "Prize" }] });
    const many = { ...cv, custom: Array.from({ length: 20 }, () => newCustomSection("S")) };
    expect(cleanCv(many).custom).toHaveLength(8);
    const hostile = cleanCv({ custom: [{ heading: 5, entries: "no" }, null, { heading: "x".repeat(900), entries: [{ title: 1 }] }] });
    expect(hostile.custom[2]!.heading).toHaveLength(200);
    // Older saves without the field read as having none.
    expect(cleanCv({ profile: {} }).custom).toEqual([]);
  });
});

describe("links in the exports", () => {
  it("become real hyperlinks in Word, keeping the address visible", () => {
    const cv = { ...exampleCv("en"), projects: [{ id: "p", name: "Tool", url: "https://example.com/tool", bullets: [] }] };
    const files = unzipSync(cvToDocx(cv));
    const xml = strFromU8(files["word/document.xml"]!);
    expect(xml).toContain("<w:hyperlink");
    expect(xml).toContain("https://github.com/example");
    const rels = strFromU8(files["word/_rels/document.xml.rels"]!);
    expect(rels).toContain("https://github.com/example");
    expect(rels).toContain("https://example.com/tool");
  });

  it("leave an address that is not a web address as plain text", () => {
    const cv = { ...exampleCv("en"), links: [{ id: "l", label: "Mail", url: "mailto:a@b.test" }, { id: "m", label: "Site", url: "javascript:alert(1)" }] };
    const html = cvToHtml(cv);
    expect(html).not.toContain("<a ");
    expect(strFromU8(unzipSync(cvToDocx(cv))["word/document.xml"]!)).not.toContain("<w:hyperlink");
    expect(cvToText(cv)).toContain("Mail: mailto:a@b.test");
  });

  it("escapes an address", () => {
    const cv = { ...exampleCv("en"), links: [{ id: "l", label: "", url: 'https://x.test/?a=1&b="2"' }] };
    expect(cvToHtml(cv)).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });
});

describe("reordering", () => {
  it("moves an item to a position, clamped, and changes nothing when it is already there", () => {
    const cv = { ...createCv("T"), experiences: [newExperience(), newExperience(), newExperience()] };
    const [a, b, c] = cv.experiences.map((e) => e.id);
    expect(reorderItem(cv, "experiences", a!, 2).experiences.map((e) => e.id)).toEqual([b, c, a]);
    expect(reorderItem(cv, "experiences", c!, 0).experiences.map((e) => e.id)).toEqual([c, a, b]);
    expect(reorderItem(cv, "experiences", a!, 99).experiences.map((e) => e.id)).toEqual([b, c, a]);
    expect(reorderItem(cv, "experiences", b!, 1)).toBe(cv);
    expect(reorderItem(cv, "experiences", "nope", 1)).toBe(cv);
  });

  it("finds where a dragged item lands from the pointer", () => {
    const mids = [10, 30, 50, 70];
    expect(targetIndex(mids, 0, 0)).toBe(0);
    expect(targetIndex(mids, 0, 45)).toBe(1);
    expect(targetIndex(mids, 0, 500)).toBe(3);
    expect(targetIndex(mids, 3, 5)).toBe(0);
    expect(targetIndex(mids, 2, 35)).toBe(2);
    expect(targetIndex(mids, 2, 25)).toBe(1);
    expect(targetIndex(mids, 1, 30)).toBe(1); // level with the item itself: it stays where it is
    expect(targetIndex([], 0, 10)).toBe(0);
  });
});
