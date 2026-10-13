import {
  ACCENT_KEYS,
  LIMITS,
  TEMPLATE_IDS,
  createCv,
  defaultSettings,
  newId,
  type AccentKey,
  type Cv,
  type CvLang,
  type CvSettings,
  type Density,
  type Paper,
  type TemplateId,
} from "@/lib/cv/schema";
import { CV_FILE_FORMAT } from "@/lib/cv/export";

/** Persisted key; the `lab:` prefix puts it in the settings backup automatically. */
export const CV_STORAGE_KEY = "lab:cv:v1";
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export interface CvStore {
  cvs: Cv[];
  current: string | null;
}

export interface CvStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const emptyStore = (): CvStore => ({ cvs: [], current: null });

function storageOrUndefined(): CvStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);
const bullets = (value: unknown): string[] =>
  list(value, LIMITS.bullets)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.slice(0, LIMITS.bullet))
    .filter((item) => item.trim() !== "");

function ids(seen: Set<string>, raw: unknown): string {
  let id = typeof raw === "string" && raw !== "" ? raw.slice(0, 40) : newId();
  if (seen.has(id)) id = newId();
  seen.add(id);
  return id;
}

const obj = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

function cleanSettings(raw: unknown): CvSettings {
  const input = obj(raw);
  const lang: CvLang = input.lang === "ru" ? "ru" : "en";
  const base = defaultSettings(lang);
  return {
    lang,
    template: TEMPLATE_IDS.includes(input.template as TemplateId) ? (input.template as TemplateId) : base.template,
    paper: input.paper === "letter" ? ("letter" as Paper) : "a4",
    accent: ACCENT_KEYS.includes(input.accent as AccentKey) ? (input.accent as AccentKey) : base.accent,
    density: input.density === "compact" ? ("compact" as Density) : "normal",
    decorations: input.decorations !== false,
  };
}

/** A CV from untrusted data: every field bounded, every list capped, every id unique. */
export function cleanCv(raw: unknown, fallbackName = "CV"): Cv {
  const input = obj(raw);
  const profile = obj(input.profile);
  const seen = new Set<string>();
  const base = createCv(text(input.name, LIMITS.name).trim() || fallbackName);
  return {
    id: ids(new Set(), input.id),
    name: base.name,
    profile: {
      fullName: text(profile.fullName, LIMITS.field),
      headline: text(profile.headline, LIMITS.field),
      email: text(profile.email, LIMITS.field),
      phone: text(profile.phone, LIMITS.field),
      location: text(profile.location, LIMITS.field),
      summary: text(profile.summary, LIMITS.summary),
    },
    links: list(input.links, LIMITS.links).map((item) => {
      const link = obj(item);
      return { id: ids(seen, link.id), label: text(link.label, LIMITS.field), url: text(link.url, LIMITS.url) };
    }),
    experiences: list(input.experiences, LIMITS.items).map((item) => {
      const e = obj(item);
      return {
        id: ids(seen, e.id),
        role: text(e.role, LIMITS.field),
        company: text(e.company, LIMITS.field),
        location: text(e.location, LIMITS.field),
        start: text(e.start, 40),
        end: text(e.end, 40),
        current: e.current === true,
        bullets: bullets(e.bullets),
      };
    }),
    education: list(input.education, LIMITS.items).map((item) => {
      const e = obj(item);
      return {
        id: ids(seen, e.id),
        school: text(e.school, LIMITS.field),
        degree: text(e.degree, LIMITS.field),
        location: text(e.location, LIMITS.field),
        start: text(e.start, 40),
        end: text(e.end, 40),
        details: bullets(e.details),
      };
    }),
    projects: list(input.projects, LIMITS.items).map((item) => {
      const p = obj(item);
      return { id: ids(seen, p.id), name: text(p.name, LIMITS.field), url: text(p.url, LIMITS.url), bullets: bullets(p.bullets) };
    }),
    skills: list(input.skills, LIMITS.skillGroups).map((item) => {
      const g = obj(item);
      return { id: ids(seen, g.id), label: text(g.label, LIMITS.field), items: text(g.items, LIMITS.skillItems) };
    }),
    settings: cleanSettings(input.settings),
    updated: typeof input.updated === "number" && Number.isFinite(input.updated) ? Math.max(0, Math.floor(input.updated)) : 0,
  };
}

export function readCvStore(storage: CvStorage | undefined = storageOrUndefined()): CvStore {
  const store = emptyStore();
  if (!storage) return store;
  try {
    const raw = JSON.parse(storage.getItem(CV_STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object") return store;
    const seen = new Set<string>();
    for (const item of list(raw.cvs, LIMITS.cvs)) {
      const cv = cleanCv(item);
      if (seen.has(cv.id)) cv.id = newId();
      seen.add(cv.id);
      store.cvs.push(cv);
    }
    store.current = store.cvs.some((cv) => cv.id === raw.current) ? (raw.current as string) : (store.cvs[0]?.id ?? null);
  } catch {
    // Corrupt data: start fresh.
  }
  return store;
}

export function writeCvStore(store: CvStore, storage: CvStorage | undefined = storageOrUndefined()): void {
  if (!storage) return;
  try {
    storage.setItem(CV_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // A full disk cannot be helped; the CV is still on screen to export.
  }
}

/** A CV from a file's text, or null when it is not one. It becomes a new CV with its own id. */
export function parseCvFile(textContent: string): Cv | null {
  if (textContent.length > MAX_FILE_BYTES) return null;
  try {
    const raw = JSON.parse(textContent) as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || raw.format !== CV_FILE_FORMAT || !raw.cv || typeof raw.cv !== "object") return null;
    const cv = cleanCv(raw.cv, "Imported CV");
    return { ...cv, id: newId(), updated: Date.now() };
  } catch {
    return null;
  }
}
