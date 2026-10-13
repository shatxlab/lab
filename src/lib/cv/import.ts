/**
 * Turn pasted résumé text (an old CV, a LinkedIn profile copied as text) into a CV
 * to fix up. It is a heuristic reader, not a promise: it finds the contact details,
 * recognises the usual section headings in English and Russian, and splits each
 * section into entries by dates and blank lines. What it cannot place is kept
 * where a person would look for it, so nothing is lost, and the result opens in
 * the form for checking.
 */

import { LIMITS, createCv, newCustomEntry, newCustomSection, newEducation, newExperience, newId, newLink, newProject, newSkillGroup, type CvLang, type Cv } from "@/lib/cv/schema";

export interface ImportSummary {
  name: boolean;
  contact: number;
  links: number;
  jobs: number;
  schools: number;
  projects: number;
  skillGroups: number;
  customSections: number;
}

export interface ImportResult {
  cv: Cv;
  found: ImportSummary;
  /** Nothing recognisable was in the text. */
  empty: boolean;
}

type Kind = "summary" | "experience" | "education" | "projects" | "skills" | "custom";

const HEADINGS: { kind: Kind; names: string[] }[] = [
  { kind: "summary", names: ["summary", "professional summary", "career summary", "profile", "professional profile", "about", "about me", "objective", "career objective", "о себе", "обо мне", "цель", "профиль", "краткое описание"] },
  { kind: "experience", names: ["experience", "work experience", "professional experience", "employment", "employment history", "work history", "career history", "опыт работы", "опыт", "места работы", "карьера"] },
  { kind: "education", names: ["education", "academic background", "education and training", "образование"] },
  { kind: "projects", names: ["projects", "personal projects", "side projects", "selected projects", "проекты", "личные проекты"] },
  { kind: "skills", names: ["skills", "technical skills", "key skills", "core skills", "core competencies", "skills and tools", "skills & tools", "technologies", "навыки", "ключевые навыки", "технические навыки", "технологии"] },
  { kind: "custom", names: ["certifications", "certificates", "licenses", "licenses and certifications", "licenses & certifications", "сертификаты", "лицензии"] },
  { kind: "custom", names: ["languages", "language skills", "языки", "знание языков"] },
  { kind: "custom", names: ["awards", "honors", "honours", "achievements", "awards and honors", "достижения", "награды"] },
  { kind: "custom", names: ["volunteering", "volunteer experience", "volunteer work", "волонтёрство", "волонтерство"] },
  { kind: "custom", names: ["publications", "публикации"] },
  { kind: "custom", names: ["courses", "training", "training and courses", "курсы", "обучение"] },
];

const normalize = (line: string): string =>
  line
    .toLowerCase()
    .replace(/^[\s#*_>\-–—•|]+|[\s#*_:|\-–—]+$/g, "")
    .replace(/\s+/g, " ");

interface Heading {
  kind: Kind;
  /** The heading as the writer typed it (sentence case when it was all capitals). */
  title: string;
}

function typed(line: string): string {
  const text = line.trim().replace(/^[\s#*_>-]+|[\s:*_]+$/g, "");
  const letters = text.replace(/[^\p{L}]/gu, "");
  const shouting = letters.length > 1 && letters === letters.toLocaleUpperCase();
  return shouting ? text.charAt(0) + text.slice(1).toLocaleLowerCase() : text;
}

function headingOf(line: string, allowCaps: boolean): Heading | null {
  const key = normalize(line);
  if (!key || key.length > 40) return null;
  for (const entry of HEADINGS) if (entry.names.includes(key)) return { kind: entry.kind, title: typed(line) };
  // An unknown line in capitals ("PUBLIC SPEAKING") is a heading of the writer's own.
  const letters = line.replace(/[^\p{L}]/gu, "");
  const words = line.trim().split(/\s+/).length;
  if (allowCaps && letters.length >= 4 && letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase() && words <= 4 && !/[@\d]/.test(line) && line.trim().length <= 30) {
    return { kind: "custom", title: typed(line) };
  }
  return null;
}

/* ------------------------------------------------------------ small readers */

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?:\+\d|\(\d{2,4}\)|\b\d{3,4}[\s.-]\d)[\d\s().-]{6,}\d/;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;|<>()]+|\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com|medium\.com|t\.me|habr\.com)\/[^\s,;|<>()]+/gi;
const BULLET = /^\s*(?:[-•*–·▪●◦‣▸►]|\d{1,2}[.)])\s+/;

const stripBullet = (line: string): string => line.replace(BULLET, "").trim();
const isBullet = (line: string): boolean => BULLET.test(line);

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|янв(?:арь|аря)?|фев(?:раль|раля)?|мар(?:т|та)?|апр(?:ель|еля)?|ма[йя]|июн(?:ь|я)?|июл(?:ь|я)?|авг(?:уст|уста)?|сен(?:тябрь|тября)?|окт(?:ябрь|ября)?|ноя(?:брь|бря)?|дек(?:абрь|абря)?)";
const DATE = `(?:${MONTH}\\.?\\s+(?:19|20)\\d{2}|\\d{1,2}[./](?:19|20)\\d{2}|(?:19|20)\\d{2})`;
const END = `(?:${DATE}|present|now|current|today|ongoing|по\\s+настоящее\\s+время|настоящее\\s+время|н\\.\\s?в\\.?|сейчас)`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to|until|по|до)\\s*(${END})`, "i");
const PRESENT = /^(?:present|now|current|today|ongoing|по\s+настоящее\s+время|настоящее\s+время|н\.\s?в\.?|сейчас)$/i;
const LONE_YEAR = /\b(?:19|20)\d{2}\b/;

/** The dates in a line, the line without them, and whether it ends in "present". */
export function extractDates(line: string): { start: string; end: string; current: boolean; rest: string } {
  const range = RANGE.exec(line);
  const tidy = (text: string): string =>
    text
      .replace(/[([{]\s*[)\]}]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s|·•,;:–—-]+|[\s|·•,;:–—-]+$/g, "")
      .trim();
  if (range) {
    const end = range[2]!.trim();
    const current = PRESENT.test(end);
    return { start: range[1]!.trim(), end: current ? "" : end, current, rest: tidy(line.replace(range[0], " ")) };
  }
  return { start: "", end: "", current: false, rest: tidy(line) };
}

/** A lone year (or "2015 – 2019" already handled above) for entries that only have one date. */
function loneYear(line: string): { year: string; rest: string } {
  const match = LONE_YEAR.exec(line);
  if (!match) return { year: "", rest: line };
  return { year: match[0], rest: extractDates(line.replace(match[0], " ")).rest };
}

const LINK_LABELS: [RegExp, string][] = [
  [/linkedin\.com/i, "LinkedIn"],
  [/github\.com/i, "GitHub"],
  [/gitlab\.com/i, "GitLab"],
  [/behance\.net/i, "Behance"],
  [/dribbble\.com/i, "Dribbble"],
  [/medium\.com/i, "Medium"],
  [/habr\.com/i, "Habr"],
  [/t\.me/i, "Telegram"],
];

function linkOf(raw: string): { label: string; url: string } {
  const trimmed = raw.replace(/[.,;)]+$/, "");
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const known = LINK_LABELS.find(([pattern]) => pattern.test(url));
  if (known) return { label: known[1], url };
  const host = url.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0] ?? "";
  return { label: host, url };
}

const cap = (value: string, max: number): string => value.trim().slice(0, max);

/** Split "Role at Company | City" style text on the separators résumés use. */
function parts(text: string): string[] {
  return text
    .split(/\s+(?:at|@|в)\s+|\s*[|•·]\s*|\s+[—–]\s+|\s+-\s+/i)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

// \b does not understand Cyrillic, so words are fenced with lookarounds instead.
const WORD = (words: string) => new RegExp(`(?<![\\p{L}\\d])(?:${words})(?![\\p{L}\\d])`, "iu");
const EMPLOYMENT_TYPE = new RegExp(WORD("full[- ]time|part[- ]time|contract|freelance|self[- ]employed|internship|permanent|полная занятость|частичная занятость|стажировка").source, "giu");
const SCHOOL = WORD("university|college|institute|school|academy|polytechnic|gymnasium|lyceum|университет|институт|академия|колледж|школа|лицей|гимназия|факультет|вуз");
const DEGREE = WORD("bachelor|master|ph\\.?d|doctor|bsc|msc|ba|ma|mba|b\\.s\\.|m\\.s\\.|associate|diploma|degree|бакалавр|магистр|специалист|аспирантура|диплом");

/* -------------------------------------------------------------------- blocks */

interface Block {
  header: string[];
  bullets: string[];
  /** Some bullet began with a marker, so unmarked lines after it are wrapped text rather than new points. */
  marked: boolean;
}

/**
 * Split a section's lines into entries. A new entry starts after a blank line, or at a
 * line with dates that follows bullets; the first lines of an entry are its heading
 * (up to three), and bullets, or any later lines, are its description.
 */
export function blocksOf(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  let afterBlank = false;
  const open = (line: string) => {
    current = { header: [line], bullets: [], marked: false };
    blocks.push(current);
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      afterBlank = true;
      continue;
    }
    if (!current) {
      open(isBullet(line) ? stripBullet(line) : line);
      if (isBullet(line)) {
        current!.header = [];
        current!.bullets.push(stripBullet(line));
        current!.marked = true;
      }
      afterBlank = false;
      continue;
    }
    const block: Block = current;
    // A heading line is short and does not end like a sentence, unless it carries the dates.
    const headingLike = (line.length <= 60 && !/[.!?]$/.test(line)) || RANGE.test(line);
    // A short last line after the dates is the place ("Moscow"), still part of the heading.
    const place = block.header.length === 3 && block.header.some((text) => RANGE.test(text)) && line.length <= 40 && !/[.!?]$/.test(line);
    if (isBullet(line)) {
      block.bullets.push(stripBullet(line));
      block.marked = true;
    } else if (block.bullets.length === 0 && !afterBlank && headingLike && (block.header.length < 3 || place)) {
      block.header.push(line);
    } else if (afterBlank || (block.bullets.length > 0 && RANGE.test(line))) {
      open(line);
    } else if (block.bullets.length > 0 && block.marked) {
      // A wrapped line of the last bullet.
      block.bullets[block.bullets.length - 1] += ` ${line}`;
    } else {
      block.bullets.push(line);
    }
    afterBlank = false;
  }
  return blocks.filter((block) => block.header.length > 0 || block.bullets.length > 0);
}

/* ------------------------------------------------------------------- sections */

function readExperience(lines: readonly string[], cv: Cv): void {
  for (const block of blocksOf(lines)) {
    const job = newExperience();
    let rest: string[] = [];
    for (const line of block.header) {
      const dates = extractDates(line);
      if (dates.start && !job.start) {
        job.start = cap(dates.start, 40);
        job.end = cap(dates.end, 40);
        job.current = dates.current;
      }
      if (dates.rest) rest.push(dates.rest.replace(EMPLOYMENT_TYPE, "").replace(/[\s·|,–—-]+$/g, "").trim());
    }
    rest = rest.filter(Boolean);
    if (rest.length === 1) {
      const pieces = rest[0]!.includes(",") && parts(rest[0]!).length === 1 ? rest[0]!.split(/,\s*/) : parts(rest[0]!);
      job.role = cap(pieces[0] ?? "", LIMITS.field);
      job.company = cap(pieces[1] ?? "", LIMITS.field);
      job.location = cap(pieces.slice(2).join(", "), LIMITS.field);
    } else if (rest.length >= 2) {
      job.role = cap(rest[0]!, LIMITS.field);
      const second = parts(rest[1]!);
      job.company = cap(second[0] ?? "", LIMITS.field);
      job.location = cap([...second.slice(1), ...rest.slice(2)].join(", "), LIMITS.field);
    }
    job.bullets = block.bullets.map((bullet) => cap(bullet, LIMITS.bullet)).filter(Boolean).slice(0, LIMITS.bullets);
    if (job.role || job.company || job.bullets.length) cv.experiences.push(job);
  }
}

function readEducation(lines: readonly string[], cv: Cv): void {
  for (const block of blocksOf(lines)) {
    const entry = newEducation();
    const texts: string[] = [];
    for (const line of block.header) {
      const dates = extractDates(line);
      let rest = dates.rest;
      if (dates.start) {
        entry.start = cap(dates.start, 40);
        entry.end = cap(dates.end, 40);
      } else {
        const year = loneYear(line);
        if (year.year && !entry.end) {
          entry.end = year.year;
          rest = year.rest;
        }
      }
      if (rest) texts.push(rest);
    }
    // On one line the commas separate degree, school and place; across lines each line is a piece of its own.
    const pieces = texts.length === 1 ? (parts(texts[0]!).length > 1 ? parts(texts[0]!) : texts[0]!.split(/,\s*/)) : texts.flatMap((text) => parts(text));
    const school = pieces.find((piece) => SCHOOL.test(piece));
    const degree = pieces.find((piece) => piece !== school && (DEGREE.test(piece) || !SCHOOL.test(piece)));
    entry.school = cap(school ?? pieces[0] ?? "", LIMITS.field);
    entry.degree = cap(degree ?? (school ? "" : (pieces[1] ?? "")), LIMITS.field);
    const left = pieces.filter((piece) => piece !== school && piece !== degree);
    entry.location = cap(left.join(", "), LIMITS.field);
    entry.details = block.bullets.map((bullet) => cap(bullet, LIMITS.bullet)).filter(Boolean).slice(0, LIMITS.bullets);
    if (entry.school || entry.degree || entry.details.length) cv.education.push(entry);
  }
}

function readProjects(lines: readonly string[], cv: Cv): void {
  for (const block of blocksOf(lines)) {
    const project = newProject();
    const head = block.header.join(" — ");
    const url = URL_RE.exec(head);
    URL_RE.lastIndex = 0;
    if (url) project.url = linkOf(url[0]).url.slice(0, LIMITS.url);
    project.name = cap(head.replace(URL_RE, " ").replace(/[\s|·•,;:–—-]+$/g, "").replace(/^[\s|·•,;:–—-]+/g, "").replace(/\s{2,}/g, " "), LIMITS.field);
    URL_RE.lastIndex = 0;
    project.bullets = block.bullets.map((bullet) => cap(bullet, LIMITS.bullet)).filter(Boolean).slice(0, LIMITS.bullets);
    if (project.name || project.bullets.length) cv.projects.push(project);
  }
}

function readSkills(lines: readonly string[], cv: Cv): void {
  const plain: string[] = [];
  for (const raw of lines) {
    const line = stripBullet(raw.trim());
    if (!line) continue;
    const colon = /^([^:]{2,40}):\s*(.+)$/.exec(line);
    if (colon) {
      const group = newSkillGroup();
      group.label = cap(colon[1]!, LIMITS.field);
      group.items = cap(colon[2]!.replace(/\s*[;|•·]\s*/g, ", "), LIMITS.skillItems);
      cv.skills.push(group);
    } else plain.push(line.replace(/\s*[;|•·]\s*/g, ", "));
  }
  if (plain.length) {
    const group = newSkillGroup();
    group.items = cap(plain.join(", "), LIMITS.skillItems);
    cv.skills.push(group);
  }
}

function readCustom(title: string, lines: readonly string[], cv: Cv): boolean {
  const section = newCustomSection(title);
  for (const raw of lines) {
    const text = raw.trim();
    if (!text) continue;
    if (isBullet(text) && section.entries.length > 0) {
      section.entries[section.entries.length - 1]!.bullets.push(cap(stripBullet(text), LIMITS.bullet));
      continue;
    }
    const entry = newCustomEntry();
    const dates = extractDates(stripBullet(text));
    let rest = dates.rest;
    if (dates.start) entry.dates = cap(dates.end || dates.current ? `${dates.start} – ${dates.current ? "" : dates.end}`.replace(/ – $/, "") : dates.start, 40);
    else {
      const year = loneYear(rest);
      if (year.year) {
        entry.dates = year.year;
        rest = year.rest;
      }
    }
    const pieces = parts(rest);
    entry.title = cap(pieces[0] ?? rest, LIMITS.field);
    entry.subtitle = cap(pieces.slice(1).join(", "), LIMITS.field);
    if (entry.title || entry.subtitle) section.entries.push(entry);
  }
  if (section.entries.length === 0) return false;
  section.entries = section.entries.slice(0, LIMITS.customEntries);
  cv.custom.push(section);
  return true;
}

/* --------------------------------------------------------------------- header */

function readHeader(lines: readonly string[], cv: Cv): { contact: number; links: number; name: boolean } {
  let contact = 0;
  let links = 0;
  const leftovers: string[] = [];
  for (const raw of lines) {
    let line = raw.trim();
    if (!line) continue;
    const email = EMAIL.exec(line);
    if (email && !cv.profile.email) {
      cv.profile.email = cap(email[0], LIMITS.field);
      contact += 1;
    }
    line = line.replace(EMAIL, " ");
    for (const match of line.match(URL_RE) ?? []) {
      const link = linkOf(match);
      if (cv.links.length < LIMITS.links && !cv.links.some((existing) => existing.url === link.url)) {
        cv.links.push({ ...newLink(), label: cap(link.label, LIMITS.field), url: cap(link.url, LIMITS.url) });
        links += 1;
      }
    }
    line = line.replace(URL_RE, " ");
    const phone = PHONE.exec(line);
    if (phone && !cv.profile.phone) {
      cv.profile.phone = cap(phone[0].replace(/\s+/g, " "), LIMITS.field);
      contact += 1;
    }
    line = line.replace(PHONE, " ").replace(/\b(?:e-?mail|phone|tel|mobile|тел(?:ефон)?|почта)\s*:?/gi, " ");
    for (const piece of line.split(/\s*[|•·]\s*|\s{3,}/)) {
      const text = piece.replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, "").trim();
      if (text) leftovers.push(text);
    }
  }

  let name = false;
  const used = new Set<number>();
  const first = leftovers.findIndex((text) => text.split(/\s+/).length <= 5 && text.length <= 60 && !/[.!?]$/.test(text) && !/\d/.test(text));
  if (first >= 0) {
    cv.profile.fullName = cap(leftovers[first]!, LIMITS.field);
    used.add(first);
    name = true;
  }
  for (const [index, text] of leftovers.entries()) {
    if (used.has(index)) continue;
    if (text.length > 90 || /[.!?]$/.test(text)) {
      cv.profile.summary = cap(cv.profile.summary ? `${cv.profile.summary} ${text}` : text, LIMITS.summary);
    } else if (!cv.profile.headline && index === (first >= 0 ? first + 1 : 0) && !text.includes(",")) {
      cv.profile.headline = cap(text, LIMITS.field);
    } else if (!cv.profile.location) {
      cv.profile.location = cap(text, LIMITS.field);
      contact += 1;
    } else if (!cv.profile.headline) cv.profile.headline = cap(text, LIMITS.field);
  }
  return { contact, links, name };
}

/** Cyrillic letters make up enough of the text to call it Russian. */
export function detectLang(text: string): CvLang {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return "en";
  const cyrillic = letters.filter((letter) => /[Ѐ-ӿ]/.test(letter)).length;
  return cyrillic / letters.length > 0.3 ? "ru" : "en";
}

/** Read pasted text into a new CV (with a fresh id) and a summary of what was found. */
export function importCvText(input: string, nameFallback = "Imported CV"): ImportResult {
  const text = input.replace(/\r\n?/g, "\n").replace(/[​‌‍﻿]/g, "").replace(/\t/g, "   ").slice(0, 60_000);
  const lang = detectLang(text);
  const cv = createCv(nameFallback, lang);
  // No line of a CV is long enough to need more, and the readers below stay quick on any input.
  const lines = text.split("\n").map((line) => line.slice(0, 2000));

  // Cut into the header and the sections that follow it.
  const sections: { heading: Heading; lines: string[] }[] = [];
  const header: string[] = [];
  let seenHeading = false;
  for (const [index, line] of lines.entries()) {
    const heading = headingOf(line, seenHeading || index > 3);
    if (heading) {
      sections.push({ heading, lines: [] });
      seenHeading = true;
    } else if (sections.length > 0) sections[sections.length - 1]!.lines.push(line);
    else header.push(line);
  }

  const summary = readHeader(header, cv);
  let customSections = 0;
  for (const section of sections) {
    const { kind, title } = section.heading;
    if (kind === "summary") {
      const paragraph = section.lines.map((line) => line.trim()).filter(Boolean).join(" ");
      if (paragraph) cv.profile.summary = cap(cv.profile.summary ? `${cv.profile.summary} ${paragraph}` : paragraph, LIMITS.summary);
    } else if (kind === "experience") readExperience(section.lines, cv);
    else if (kind === "education") readEducation(section.lines, cv);
    else if (kind === "projects") readProjects(section.lines, cv);
    else if (kind === "skills") readSkills(section.lines, cv);
    else if (cv.custom.length < LIMITS.customSections && readCustom(title, section.lines, cv)) customSections += 1;
  }
  cv.experiences = cv.experiences.slice(0, LIMITS.items);
  cv.education = cv.education.slice(0, LIMITS.items);
  cv.projects = cv.projects.slice(0, LIMITS.items);
  cv.skills = cv.skills.slice(0, LIMITS.skillGroups);

  cv.name = cv.profile.fullName ? cap(cv.profile.fullName, LIMITS.name) : nameFallback;
  cv.id = newId();
  const found: ImportSummary = {
    name: summary.name,
    contact: summary.contact,
    links: summary.links,
    jobs: cv.experiences.length,
    schools: cv.education.length,
    projects: cv.projects.length,
    skillGroups: cv.skills.length,
    customSections,
  };
  // A lone line that merely looks like a name is not a CV.
  const empty = found.contact === 0 && found.links === 0 && found.jobs + found.schools + found.projects + found.skillGroups + customSections === 0 && !cv.profile.summary;
  return { cv, found, empty };
}
