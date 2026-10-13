/** Edits to a CV as pure functions: the form feeds them to its state setter. */

import type { CustomEntry, Cv, CvSettings, Profile } from "@/lib/cv/schema";

export type ListKey = "links" | "experiences" | "education" | "projects" | "skills" | "custom";

const touch = (cv: Cv, patch: Partial<Cv>): Cv => ({ ...cv, ...patch, updated: Date.now() });

export const setName = (cv: Cv, name: string): Cv => touch(cv, { name });
export const setProfile = (cv: Cv, patch: Partial<Profile>): Cv => touch(cv, { profile: { ...cv.profile, ...patch } });
export const setSettings = (cv: Cv, patch: Partial<CvSettings>): Cv => touch(cv, { settings: { ...cv.settings, ...patch } });

type Item = { id: string };

export function addItem<K extends ListKey>(cv: Cv, key: K, item: Cv[K][number], max = 30): Cv {
  const list = cv[key] as Item[];
  return list.length >= max ? cv : touch(cv, { [key]: [...list, item] } as Partial<Cv>);
}

export function updateItem<K extends ListKey>(cv: Cv, key: K, id: string, patch: Partial<Cv[K][number]>): Cv {
  const list = cv[key] as Item[];
  return touch(cv, { [key]: list.map((item) => (item.id === id ? { ...item, ...patch } : item)) } as Partial<Cv>);
}

export function removeItem(cv: Cv, key: ListKey, id: string): Cv {
  return touch(cv, { [key]: (cv[key] as Item[]).filter((item) => item.id !== id) } as Partial<Cv>);
}

/** Move an item one place up (-1) or down (1); at the ends nothing changes. */
export function moveItem(cv: Cv, key: ListKey, id: string, direction: -1 | 1): Cv {
  const list = [...(cv[key] as Item[])];
  const from = list.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return cv;
  [list[from], list[to]] = [list[to]!, list[from]!];
  return touch(cv, { [key]: list } as Partial<Cv>);
}

/** Move an item to position `to` (0-based, within the list as it will be after the move). */
export function reorderItem(cv: Cv, key: ListKey, id: string, to: number): Cv {
  const list = [...(cv[key] as Item[])];
  const from = list.findIndex((item) => item.id === id);
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (from < 0 || from === target) return cv;
  const [moved] = list.splice(from, 1);
  list.splice(target, 0, moved!);
  return touch(cv, { [key]: list } as Partial<Cv>);
}

/* Entries inside a custom section. */

/** The CV with one custom section's entries changed; the very same CV when they were not. */
function mapSection(cv: Cv, sectionId: string, change: (entries: CustomEntry[]) => CustomEntry[]): Cv {
  let changed = false;
  const custom = cv.custom.map((section) => {
    if (section.id !== sectionId) return section;
    const entries = change(section.entries);
    if (entries === section.entries) return section;
    changed = true;
    return { ...section, entries };
  });
  return changed ? touch(cv, { custom }) : cv;
}

export const addCustomEntry = (cv: Cv, sectionId: string, entry: CustomEntry, max = 30): Cv =>
  mapSection(cv, sectionId, (entries) => (entries.length >= max ? entries : [...entries, entry]));

export const updateCustomEntry = (cv: Cv, sectionId: string, id: string, patch: Partial<CustomEntry>): Cv =>
  mapSection(cv, sectionId, (entries) => entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

export const removeCustomEntry = (cv: Cv, sectionId: string, id: string): Cv => mapSection(cv, sectionId, (entries) => entries.filter((entry) => entry.id !== id));

export function reorderCustomEntry(cv: Cv, sectionId: string, id: string, to: number): Cv {
  return mapSection(cv, sectionId, (entries) => {
    const list = [...entries];
    const from = list.findIndex((entry) => entry.id === id);
    const target = Math.max(0, Math.min(list.length - 1, to));
    if (from < 0 || from === target) return entries;
    const [moved] = list.splice(from, 1);
    list.splice(target, 0, moved!);
    return list;
  });
}

/** Bullets are typed one per line; empty lines are dropped. */
export const bulletsFromText = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

export const bulletsToText = (bullets: readonly string[]): string => bullets.join("\n");
