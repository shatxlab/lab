/**
 * The résumé as data. One schema feeds the form, every template and every
 * export, so they can never disagree about what is in the CV.
 */

export type CvLang = "en" | "ru";
export type TemplateId = "classic" | "modern" | "minimal" | "ats";
export const TEMPLATE_IDS: readonly TemplateId[] = ["classic", "modern", "minimal", "ats"];
export type Paper = "a4" | "letter";
export type AccentKey = "blue" | "green" | "violet" | "red" | "ink";
export const ACCENT_KEYS: readonly AccentKey[] = ["blue", "green", "violet", "red", "ink"];
export type Density = "normal" | "compact";

export interface Profile {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
}

export interface CvLink {
  id: string;
  label: string;
  url: string;
}

export interface Experience {
  id: string;
  role: string;
  company: string;
  location: string;
  start: string;
  end: string;
  /** Still working there: the end date reads "Present". */
  current: boolean;
  bullets: string[];
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  location: string;
  start: string;
  end: string;
  details: string[];
}

export interface Project {
  id: string;
  name: string;
  url: string;
  bullets: string[];
}

export interface SkillGroup {
  id: string;
  /** "Languages", "Tools"…; may be empty for one plain list. */
  label: string;
  /** Comma-separated, as typed. */
  items: string;
}

export interface CvSettings {
  template: TemplateId;
  paper: Paper;
  accent: AccentKey;
  density: Density;
  /** Accent colour and rules; off gives plain black on white whatever the template. */
  decorations: boolean;
  /** The language of the section headings and of "Present". */
  lang: CvLang;
}

export interface Cv {
  id: string;
  /** What the CV is called in the list (and its file). */
  name: string;
  profile: Profile;
  links: CvLink[];
  experiences: Experience[];
  education: Education[];
  projects: Project[];
  skills: SkillGroup[];
  settings: CvSettings;
  updated: number;
}

export const LIMITS = {
  name: 120,
  field: 200,
  summary: 2000,
  bullet: 500,
  bullets: 20,
  items: 30,
  links: 8,
  skillGroups: 20,
  skillItems: 600,
  url: 300,
  cvs: 20,
} as const;

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const defaultSettings = (lang: CvLang = "en"): CvSettings => ({ template: "classic", paper: lang === "ru" ? "a4" : "a4", accent: "blue", density: "normal", decorations: true, lang });

export const emptyProfile = (): Profile => ({ fullName: "", headline: "", email: "", phone: "", location: "", summary: "" });

export function createCv(name: string, lang: CvLang = "en"): Cv {
  return {
    id: newId(),
    name,
    profile: emptyProfile(),
    links: [],
    experiences: [],
    education: [],
    projects: [],
    skills: [],
    settings: defaultSettings(lang),
    updated: Date.now(),
  };
}

export const newExperience = (): Experience => ({ id: newId(), role: "", company: "", location: "", start: "", end: "", current: false, bullets: [] });
export const newEducation = (): Education => ({ id: newId(), school: "", degree: "", location: "", start: "", end: "", details: [] });
export const newProject = (): Project => ({ id: newId(), name: "", url: "", bullets: [] });
export const newSkillGroup = (): SkillGroup => ({ id: newId(), label: "", items: "" });
export const newLink = (): CvLink => ({ id: newId(), label: "", url: "" });

/** A made-up CV to show what the fields are for. Everyone in it is fictional. */
export function exampleCv(lang: CvLang): Cv {
  const cv = createCv(lang === "ru" ? "Пример резюме" : "Example résumé", lang);
  if (lang === "ru") {
    cv.profile = {
      fullName: "Анна Петрова",
      headline: "Инженер-программист",
      email: "anna.petrova@example.com",
      phone: "+7 900 000-00-00",
      location: "Москва",
      summary: "Инженер с шестилетним опытом разработки веб-сервисов. Люблю простые решения, понятный код и измеримый результат.",
    };
    cv.links = [{ id: newId(), label: "GitHub", url: "https://github.com/example" }];
    cv.experiences = [
      { id: newId(), role: "Ведущий разработчик", company: "ООО «Пример»", location: "Москва", start: "03.2022", end: "", current: true, bullets: ["Сократила время отклика API на 40% после переработки кэширования.", "Руководила командой из четырёх человек и проводила код-ревью."] },
      { id: newId(), role: "Разработчик", company: "АО «Образец»", location: "Санкт-Петербург", start: "06.2019", end: "02.2022", current: false, bullets: ["Разработала сервис уведомлений для 200 тысяч пользователей."] },
    ];
    cv.education = [{ id: newId(), school: "Университет «Пример»", degree: "Бакалавр, прикладная математика и информатика", location: "Москва", start: "2015", end: "2019", details: [] }];
    cv.skills = [
      { id: newId(), label: "Языки", items: "TypeScript, Python, SQL" },
      { id: newId(), label: "Инструменты", items: "Git, Docker, PostgreSQL" },
    ];
    return cv;
  }
  cv.profile = {
    fullName: "Alex Morgan",
    headline: "Software engineer",
    email: "alex.morgan@example.com",
    phone: "+1 555 010 0100",
    location: "Austin, TX",
    summary: "Engineer with six years of experience building web services. I like simple designs, readable code and results that can be measured.",
  };
  cv.links = [{ id: newId(), label: "GitHub", url: "https://github.com/example" }];
  cv.experiences = [
    { id: newId(), role: "Senior engineer", company: "Example Corp", location: "Austin, TX", start: "Mar 2022", end: "", current: true, bullets: ["Cut API response time by 40% by reworking the caching layer.", "Led a team of four and ran code reviews."] },
    { id: newId(), role: "Engineer", company: "Sample Ltd", location: "Remote", start: "Jun 2019", end: "Feb 2022", current: false, bullets: ["Built a notifications service used by 200,000 people."] },
  ];
  cv.education = [{ id: newId(), school: "Example University", degree: "BSc, Computer Science", location: "Austin, TX", start: "2015", end: "2019", details: [] }];
  cv.skills = [
    { id: newId(), label: "Languages", items: "TypeScript, Python, SQL" },
    { id: newId(), label: "Tools", items: "Git, Docker, PostgreSQL" },
  ];
  return cv;
}
