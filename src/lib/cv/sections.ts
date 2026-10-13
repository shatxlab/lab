/**
 * The CV as the reader sees it: a header and ordered sections of blocks, with
 * empty things left out and headings in the CV's own language. The page preview,
 * the HTML/DOCX export and the plain-text export all read this, so a change is
 * made once.
 */

import type { Cv, CvLang } from "@/lib/cv/schema";

export interface HeaderModel {
  name: string;
  headline: string;
  /** Email, phone and location, in that order, empties dropped. */
  contact: string[];
  links: { label: string; url: string }[];
}

export type Block =
  | { kind: "paragraph"; text: string }
  | { kind: "entry"; title: string; subtitle: string; place: string; dates: string; bullets: string[]; url?: string }
  | { kind: "skills"; label: string; items: string[] };

export type SectionId = "summary" | "experience" | "education" | "projects" | "skills";

export interface Section {
  id: SectionId;
  heading: string;
  blocks: Block[];
}

export const HEADINGS: Record<CvLang, Record<SectionId, string>> = {
  en: { summary: "Summary", experience: "Experience", education: "Education", projects: "Projects", skills: "Skills" },
  ru: { summary: "О себе", experience: "Опыт работы", education: "Образование", projects: "Проекты", skills: "Навыки" },
};
export const PRESENT: Record<CvLang, string> = { en: "Present", ru: "по настоящее время" };

const clean = (value: string): string => value.trim();

/** "Mar 2022 – Present", "2015 – 2019", "2019", or "" when there is nothing to say. */
export function dateRange(start: string, end: string, current: boolean, lang: CvLang): string {
  const from = clean(start);
  const to = current ? PRESENT[lang] : clean(end);
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

/** A web address a document may link to; anything else is shown as plain text. */
export const isWebUrl = (value: string): boolean => /^https?:\/\/[^\s]+$/i.test(value.trim());

export function headerOf(cv: Cv): HeaderModel {
  const { profile } = cv;
  return {
    name: clean(profile.fullName),
    headline: clean(profile.headline),
    contact: [profile.email, profile.phone, profile.location].map(clean).filter(Boolean),
    links: cv.links.map((link) => ({ label: clean(link.label), url: clean(link.url) })).filter((link) => link.url || link.label),
  };
}

export const skillItems = (items: string): string[] =>
  items
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

export function sectionsOf(cv: Cv): Section[] {
  const lang = cv.settings.lang;
  const heading = HEADINGS[lang];
  const sections: Section[] = [];

  if (clean(cv.profile.summary)) sections.push({ id: "summary", heading: heading.summary, blocks: [{ kind: "paragraph", text: clean(cv.profile.summary) }] });

  const experience = cv.experiences
    .filter((item) => clean(item.role) || clean(item.company) || item.bullets.length > 0)
    .map<Block>((item) => ({
      kind: "entry",
      title: clean(item.role),
      subtitle: clean(item.company),
      place: clean(item.location),
      dates: dateRange(item.start, item.end, item.current, lang),
      bullets: item.bullets.map(clean).filter(Boolean),
    }));
  if (experience.length) sections.push({ id: "experience", heading: heading.experience, blocks: experience });

  const education = cv.education
    .filter((item) => clean(item.school) || clean(item.degree) || item.details.length > 0)
    .map<Block>((item) => ({
      kind: "entry",
      title: clean(item.degree),
      subtitle: clean(item.school),
      place: clean(item.location),
      dates: dateRange(item.start, item.end, false, lang),
      bullets: item.details.map(clean).filter(Boolean),
    }));
  if (education.length) sections.push({ id: "education", heading: heading.education, blocks: education });

  const projects = cv.projects
    .filter((item) => clean(item.name) || item.bullets.length > 0)
    .map<Block>((item) => ({
      kind: "entry",
      title: clean(item.name),
      subtitle: "",
      place: "",
      dates: "",
      bullets: item.bullets.map(clean).filter(Boolean),
      ...(clean(item.url) ? { url: clean(item.url) } : {}),
    }));
  if (projects.length) sections.push({ id: "projects", heading: heading.projects, blocks: projects });

  const skills = cv.skills
    .map<Block>((group) => ({ kind: "skills", label: clean(group.label), items: skillItems(group.items) }))
    .filter((block) => block.kind === "skills" && block.items.length > 0);
  if (skills.length) sections.push({ id: "skills", heading: heading.skills, blocks: skills });

  return sections;
}
