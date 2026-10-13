/** The form: one card per section, every field a plain labelled input. */

import * as React from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";

import { ActionButton, SelectField, inputClass, labelClass, textareaClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { useSortable, type Sortable } from "@/components/cv/useSortable";
import {
  addCustomEntry,
  addItem,
  bulletsFromText,
  bulletsToText,
  moveItem,
  removeCustomEntry,
  removeItem,
  reorderCustomEntry,
  reorderItem,
  setProfile,
  setSettings,
  updateCustomEntry,
  updateItem,
  type ListKey,
} from "@/lib/cv/edit";
import { tcv } from "@/lib/cv/i18n";
import {
  ACCENT_KEYS,
  CUSTOM_PRESETS,
  LIMITS,
  TEMPLATE_IDS,
  newCustomEntry,
  newCustomSection,
  newEducation,
  newExperience,
  newLink,
  newProject,
  newSkillGroup,
  type AccentKey,
  type CustomSection,
  type Cv,
  type CvLang,
  type TemplateId,
} from "@/lib/cv/schema";
import { ACCENT_HEX } from "@/components/cv/CvDocument";
import { cn } from "@/lib/viewer/utils";

export interface CvEditorProps {
  lang: AppLang;
  cv: Cv;
  onChange: (update: (cv: Cv) => Cv) => void;
}

const card = "flex flex-col gap-3 rounded-xl border border-(--border) bg-(--surface) p-4";

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className={labelClass}>
      {label}
      <input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} maxLength={LIMITS.field} autoComplete="off" {...rest} />
    </label>
  );
}

/** One bullet per line. Keeps its own text while typing so a fresh empty line is not eaten. */
function BulletsField({ label, hint, bullets, onChange }: { label: string; hint?: string; bullets: string[]; onChange: (bullets: string[]) => void }) {
  const [text, setText] = React.useState(() => bulletsToText(bullets));
  return (
    <label className={labelClass}>
      {label}
      <textarea
        className={cn(textareaClass, "min-h-24 font-sans")}
        value={text}
        spellCheck
        onChange={(event) => {
          setText(event.target.value);
          onChange(bulletsFromText(event.target.value));
        }}
      />
      {hint && <span className="text-xs font-normal text-(--muted-fg)">{hint}</span>}
    </label>
  );
}

interface ItemActions {
  up: () => void;
  down: () => void;
  remove: () => void;
}

/** One entry of a list: its fields, and the ways to move or remove it (drag handle, buttons). */
function ItemCard({ lang, what, index, count, id, actions, sort, children }: { lang: AppLang; what: string; index: number; count: number; id: string; actions: ItemActions; sort: Sortable; children: React.ReactNode }) {
  const small = "h-8 px-2";
  const name = tcv(lang, "item", { what, n: index + 1 });
  const from = sort.drag ? sort.ids.indexOf(sort.drag.id) : -1;
  const dragged = sort.drag?.id === id;
  // A bar on the side of the card the dragged item would land next to.
  const marker = sort.drag && !dragged && sort.drag.to === index ? (from > index ? "border-t-4 border-t-(--accent)" : "border-b-4 border-b-(--accent)") : "";
  return (
    <fieldset ref={sort.refFor(id)} className={cn("flex flex-col gap-3 rounded-lg border border-(--border) bg-(--bg) p-3", dragged && "opacity-60", marker)}>
      <legend className="px-1 text-xs font-medium text-(--muted-fg)">{name}</legend>
      {children}
      <div className="flex gap-1">
        {/* Dragging is for the pointer; keyboard and screen-reader users have the buttons beside it. */}
        <span
          aria-hidden="true"
          title={tcv(lang, "dragHint")}
          onPointerDown={(event) => sort.start(id, event)}
          className="inline-flex h-8 w-8 cursor-grab touch-none select-none items-center justify-center rounded-md border border-(--border) bg-(--bg) text-(--muted-fg) hover:bg-(--surface) active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </span>
        <ActionButton variant="secondary" className={small} aria-label={`${tcv(lang, "moveUp")}: ${name}`} disabled={index === 0} onClick={actions.up}>
          <ArrowUp aria-hidden="true" className="size-4" />
        </ActionButton>
        <ActionButton variant="secondary" className={small} aria-label={`${tcv(lang, "moveDown")}: ${name}`} disabled={index === count - 1} onClick={actions.down}>
          <ArrowDown aria-hidden="true" className="size-4" />
        </ActionButton>
        <ActionButton variant="secondary" className={small} aria-label={`${tcv(lang, "remove")}: ${name}`} onClick={actions.remove}>
          <Trash2 aria-hidden="true" className="size-4" />
        </ActionButton>
      </div>
    </fieldset>
  );
}

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className={card}>
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </details>
  );
}

/** A section of the writer's own: a heading and a list of entries. */
function CustomSectionEditor({ lang, section, onChange }: { lang: AppLang; section: CustomSection; onChange: CvEditorProps["onChange"] }) {
  const t = (key: Parameters<typeof tcv>[1], params?: Record<string, string | number>) => tcv(lang, key, params);
  const sort = useSortable(
    section.entries.map((entry) => entry.id),
    (id, to) => onChange((c) => reorderCustomEntry(c, section.id, id, to)),
  );
  const swap = (id: string, index: number, direction: -1 | 1) => onChange((c) => reorderCustomEntry(c, section.id, id, index + direction));
  return (
    <div className="flex flex-col gap-3">
      <Field label={t("sectionHeading")} value={section.heading} onChange={(value) => onChange((c) => updateItem(c, "custom", section.id, { heading: value }))} />
      {section.entries.map((entry, i) => (
        <ItemCard
          key={entry.id}
          lang={lang}
          what={t("oneEntry")}
          index={i}
          count={section.entries.length}
          id={entry.id}
          sort={sort}
          actions={{ up: () => swap(entry.id, i, -1), down: () => swap(entry.id, i, 1), remove: () => onChange((c) => removeCustomEntry(c, section.id, entry.id)) }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("entryTitle")} value={entry.title} onChange={(value) => onChange((c) => updateCustomEntry(c, section.id, entry.id, { title: value }))} />
            <Field label={t("entrySubtitle")} value={entry.subtitle} onChange={(value) => onChange((c) => updateCustomEntry(c, section.id, entry.id, { subtitle: value }))} />
            <Field label={t("entryDates")} value={entry.dates} maxLength={40} onChange={(value) => onChange((c) => updateCustomEntry(c, section.id, entry.id, { dates: value }))} />
          </div>
          <BulletsField label={t("details")} bullets={entry.bullets} onChange={(bullets) => onChange((c) => updateCustomEntry(c, section.id, entry.id, { bullets }))} />
        </ItemCard>
      ))}
      {section.entries.length < LIMITS.customEntries && (
        <div>
          <ActionButton variant="secondary" onClick={() => onChange((c) => addCustomEntry(c, section.id, newCustomEntry(), LIMITS.customEntries))}>
            <Plus aria-hidden="true" className="size-4" />
            {t("addEntry")}
          </ActionButton>
        </div>
      )}
    </div>
  );
}

const TEMPLATE_KEY = { classic: "templateClassic", modern: "templateModern", minimal: "templateMinimal", ats: "templateAts" } as const;
const ACCENT_KEY = { blue: "accentBlue", green: "accentGreen", violet: "accentViolet", red: "accentRed", ink: "accentInk" } as const;

export function CvEditor({ lang, cv, onChange }: CvEditorProps) {
  const { profile } = cv;
  const t = (key: Parameters<typeof tcv>[1], params?: Record<string, string | number>) => tcv(lang, key, params);
  const actions = (key: ListKey, id: string): ItemActions => ({
    up: () => onChange((c) => moveItem(c, key, id, -1)),
    down: () => onChange((c) => moveItem(c, key, id, 1)),
    remove: () => onChange((c) => removeItem(c, key, id)),
  });
  const sortOf = (key: ListKey, items: readonly { id: string }[]) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useSortable(
      items.map((item) => item.id),
      (id, to) => onChange((c) => reorderItem(c, key, id, to)),
    );
  const sorts = {
    links: sortOf("links", cv.links),
    experiences: sortOf("experiences", cv.experiences),
    education: sortOf("education", cv.education),
    projects: sortOf("projects", cv.projects),
    skills: sortOf("skills", cv.skills),
    custom: sortOf("custom", cv.custom),
  };
  const [preset, setPreset] = React.useState("");
  const addButton = (label: string, onClick: () => void) => (
    <div>
      <ActionButton variant="secondary" onClick={onClick}>
        <Plus aria-hidden="true" className="size-4" />
        {label}
      </ActionButton>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <Section title={t("profile")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("fullName")} value={profile.fullName} onChange={(value) => onChange((c) => setProfile(c, { fullName: value }))} />
          <Field label={t("headline")} value={profile.headline} onChange={(value) => onChange((c) => setProfile(c, { headline: value }))} />
          <Field label={t("email")} type="email" value={profile.email} onChange={(value) => onChange((c) => setProfile(c, { email: value }))} />
          <Field label={t("phone")} type="tel" value={profile.phone} onChange={(value) => onChange((c) => setProfile(c, { phone: value }))} />
          <Field label={t("location")} value={profile.location} onChange={(value) => onChange((c) => setProfile(c, { location: value }))} />
        </div>
        <label className={labelClass}>
          {t("summary")}
          <textarea className={cn(textareaClass, "min-h-24 font-sans")} value={profile.summary} maxLength={LIMITS.summary} onChange={(event) => onChange((c) => setProfile(c, { summary: event.target.value }))} />
          <span className="text-xs font-normal text-(--muted-fg)">{t("summaryHint")}</span>
        </label>
      </Section>

      <Section title={t("links")} open={cv.links.length > 0}>
        {cv.links.map((link, i) => (
          <ItemCard key={link.id} lang={lang} what={t("oneLink")} index={i} count={cv.links.length} id={link.id} actions={actions("links", link.id)} sort={sorts.links}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("linkLabel")} value={link.label} onChange={(value) => onChange((c) => updateItem(c, "links", link.id, { label: value }))} />
              <Field label={t("linkUrl")} type="url" maxLength={LIMITS.url} value={link.url} onChange={(value) => onChange((c) => updateItem(c, "links", link.id, { url: value }))} />
            </div>
          </ItemCard>
        ))}
        {cv.links.length < LIMITS.links && addButton(t("addLink"), () => onChange((c) => addItem(c, "links", newLink(), LIMITS.links)))}
      </Section>

      <Section title={t("experience")}>
        {cv.experiences.map((job, i) => (
          <ItemCard key={job.id} lang={lang} what={t("oneJob")} index={i} count={cv.experiences.length} id={job.id} actions={actions("experiences", job.id)} sort={sorts.experiences}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("role")} value={job.role} onChange={(value) => onChange((c) => updateItem(c, "experiences", job.id, { role: value }))} />
              <Field label={t("company")} value={job.company} onChange={(value) => onChange((c) => updateItem(c, "experiences", job.id, { company: value }))} />
              <Field label={t("location")} value={job.location} onChange={(value) => onChange((c) => updateItem(c, "experiences", job.id, { location: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("start")} value={job.start} maxLength={40} onChange={(value) => onChange((c) => updateItem(c, "experiences", job.id, { start: value }))} />
                <Field label={t("end")} value={job.current ? "" : job.end} maxLength={40} disabled={job.current} onChange={(value) => onChange((c) => updateItem(c, "experiences", job.id, { end: value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={job.current} onChange={(event) => onChange((c) => updateItem(c, "experiences", job.id, { current: event.target.checked }))} />
              {t("current")}
            </label>
            <BulletsField label={t("bullets")} hint={t("bulletsHint")} bullets={job.bullets} onChange={(bullets) => onChange((c) => updateItem(c, "experiences", job.id, { bullets }))} />
          </ItemCard>
        ))}
        {addButton(t("addExperience"), () => onChange((c) => addItem(c, "experiences", newExperience())))}
      </Section>

      <Section title={t("education")}>
        {cv.education.map((entry, i) => (
          <ItemCard key={entry.id} lang={lang} what={t("oneSchool")} index={i} count={cv.education.length} id={entry.id} actions={actions("education", entry.id)} sort={sorts.education}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("school")} value={entry.school} onChange={(value) => onChange((c) => updateItem(c, "education", entry.id, { school: value }))} />
              <Field label={t("degree")} value={entry.degree} onChange={(value) => onChange((c) => updateItem(c, "education", entry.id, { degree: value }))} />
              <Field label={t("location")} value={entry.location} onChange={(value) => onChange((c) => updateItem(c, "education", entry.id, { location: value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("start")} value={entry.start} maxLength={40} onChange={(value) => onChange((c) => updateItem(c, "education", entry.id, { start: value }))} />
                <Field label={t("end")} value={entry.end} maxLength={40} onChange={(value) => onChange((c) => updateItem(c, "education", entry.id, { end: value }))} />
              </div>
            </div>
            <BulletsField label={t("details")} bullets={entry.details} onChange={(details) => onChange((c) => updateItem(c, "education", entry.id, { details }))} />
          </ItemCard>
        ))}
        {addButton(t("addEducation"), () => onChange((c) => addItem(c, "education", newEducation())))}
      </Section>

      <Section title={t("projects")} open={cv.projects.length > 0}>
        {cv.projects.map((project, i) => (
          <ItemCard key={project.id} lang={lang} what={t("oneProject")} index={i} count={cv.projects.length} id={project.id} actions={actions("projects", project.id)} sort={sorts.projects}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("projectName")} value={project.name} onChange={(value) => onChange((c) => updateItem(c, "projects", project.id, { name: value }))} />
              <Field label={t("projectUrl")} type="url" maxLength={LIMITS.url} value={project.url} onChange={(value) => onChange((c) => updateItem(c, "projects", project.id, { url: value }))} />
            </div>
            <BulletsField label={t("details")} bullets={project.bullets} onChange={(bullets) => onChange((c) => updateItem(c, "projects", project.id, { bullets }))} />
          </ItemCard>
        ))}
        {addButton(t("addProject"), () => onChange((c) => addItem(c, "projects", newProject())))}
      </Section>

      <Section title={t("skills")}>
        {cv.skills.map((group, i) => (
          <ItemCard key={group.id} lang={lang} what={t("oneSkills")} index={i} count={cv.skills.length} id={group.id} actions={actions("skills", group.id)} sort={sorts.skills}>
            <Field label={t("skillLabel")} value={group.label} onChange={(value) => onChange((c) => updateItem(c, "skills", group.id, { label: value }))} />
            <Field label={t("skillItems")} value={group.items} maxLength={LIMITS.skillItems} onChange={(value) => onChange((c) => updateItem(c, "skills", group.id, { items: value }))} />
          </ItemCard>
        ))}
        {cv.skills.length < LIMITS.skillGroups && addButton(t("addSkills"), () => onChange((c) => addItem(c, "skills", newSkillGroup(), LIMITS.skillGroups)))}
      </Section>

      <Section title={t("customSections")} open={cv.custom.length > 0}>
        <p className="text-xs text-(--muted-fg)">{t("customHint")}</p>
        {cv.custom.map((section, i) => (
          <ItemCard key={section.id} lang={lang} what={t("oneSection")} index={i} count={cv.custom.length} id={section.id} actions={actions("custom", section.id)} sort={sorts.custom}>
            <CustomSectionEditor lang={lang} section={section} onChange={onChange} />
          </ItemCard>
        ))}
        {cv.custom.length < LIMITS.customSections && (
          <div className="flex flex-wrap items-end gap-2">
            <SelectField
              label={t("addSectionAs")}
              value={preset}
              onChange={setPreset}
              options={[{ value: "", label: t("sectionOwn") }, ...CUSTOM_PRESETS[cv.settings.lang].map((name) => ({ value: name, label: name }))]}
              className="min-w-44"
            />
            <ActionButton variant="secondary" onClick={() => onChange((c) => addItem(c, "custom", newCustomSection(preset), LIMITS.customSections))}>
              <Plus aria-hidden="true" className="size-4" />
              {t("addSection")}
            </ActionButton>
          </div>
        )}
      </Section>

      <Section title={t("design")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label={t("template")} value={cv.settings.template} onChange={(value) => onChange((c) => setSettings(c, { template: value as TemplateId }))} options={TEMPLATE_IDS.map((id) => ({ value: id, label: t(TEMPLATE_KEY[id]) }))} />
          <SelectField label={t("language")} value={cv.settings.lang} onChange={(value) => onChange((c) => setSettings(c, { lang: value as CvLang }))} options={[{ value: "en", label: t("langEn") }, { value: "ru", label: t("langRu") }]} />
          <SelectField label={t("paper")} value={cv.settings.paper} onChange={(value) => onChange((c) => setSettings(c, { paper: value === "letter" ? "letter" : "a4" }))} options={[{ value: "a4", label: t("paperA4") }, { value: "letter", label: t("paperLetter") }]} />
          <SelectField label={t("density")} value={cv.settings.density} onChange={(value) => onChange((c) => setSettings(c, { density: value === "compact" ? "compact" : "normal" }))} options={[{ value: "normal", label: t("densityNormal") }, { value: "compact", label: t("densityCompact") }]} />
        </div>
        <p className="text-xs text-(--muted-fg)">{t("templateHint")}</p>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-1 text-sm font-medium">{t("accent")}</legend>
          {ACCENT_KEYS.map((key: AccentKey) => (
            <button
              key={key}
              type="button"
              aria-pressed={cv.settings.accent === key}
              aria-label={t(ACCENT_KEY[key])}
              title={t(ACCENT_KEY[key])}
              disabled={!cv.settings.decorations}
              onClick={() => onChange((c) => setSettings(c, { accent: key }))}
              className={cn("size-7 rounded-full border-2 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)", cv.settings.accent === key ? "border-(--fg)" : "border-(--border)")}
              style={{ background: ACCENT_HEX[key] }}
            />
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={cv.settings.decorations} onChange={(event) => onChange((c) => setSettings(c, { decorations: event.target.checked }))} />
          {t("decorations")}
        </label>
      </Section>
    </div>
  );
}
