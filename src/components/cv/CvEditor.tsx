/** The form: one card per section, every field a plain labelled input. */

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { ActionButton, SelectField, inputClass, labelClass, textareaClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { addItem, bulletsFromText, bulletsToText, moveItem, removeItem, setProfile, setSettings, updateItem, type ListKey } from "@/lib/cv/edit";
import { tcv } from "@/lib/cv/i18n";
import {
  ACCENT_KEYS,
  LIMITS,
  TEMPLATE_IDS,
  newEducation,
  newExperience,
  newLink,
  newProject,
  newSkillGroup,
  type AccentKey,
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

function ItemCard({ lang, what, index, count, listKey, id, onChange, children }: { lang: AppLang; what: string; index: number; count: number; listKey: ListKey; id: string; onChange: CvEditorProps["onChange"]; children: React.ReactNode }) {
  const small = "h-8 px-2";
  const name = tcv(lang, "item", { what, n: index + 1 });
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-(--border) bg-(--bg) p-3">
      <legend className="px-1 text-xs font-medium text-(--muted-fg)">{name}</legend>
      {children}
      <div className="flex gap-1">
        <ActionButton variant="secondary" className={small} aria-label={`${tcv(lang, "moveUp")}: ${name}`} disabled={index === 0} onClick={() => onChange((cv) => moveItem(cv, listKey, id, -1))}>
          <ArrowUp aria-hidden="true" className="size-4" />
        </ActionButton>
        <ActionButton variant="secondary" className={small} aria-label={`${tcv(lang, "moveDown")}: ${name}`} disabled={index === count - 1} onClick={() => onChange((cv) => moveItem(cv, listKey, id, 1))}>
          <ArrowDown aria-hidden="true" className="size-4" />
        </ActionButton>
        <ActionButton variant="secondary" className={small} aria-label={`${tcv(lang, "remove")}: ${name}`} onClick={() => onChange((cv) => removeItem(cv, listKey, id))}>
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

const TEMPLATE_KEY = { classic: "templateClassic", modern: "templateModern", minimal: "templateMinimal", ats: "templateAts" } as const;
const ACCENT_KEY = { blue: "accentBlue", green: "accentGreen", violet: "accentViolet", red: "accentRed", ink: "accentInk" } as const;

export function CvEditor({ lang, cv, onChange }: CvEditorProps) {
  const { profile } = cv;
  const t = (key: Parameters<typeof tcv>[1], params?: Record<string, string | number>) => tcv(lang, key, params);
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
          <ItemCard key={link.id} lang={lang} what={t("oneLink")} index={i} count={cv.links.length} listKey="links" id={link.id} onChange={onChange}>
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
          <ItemCard key={job.id} lang={lang} what={t("oneJob")} index={i} count={cv.experiences.length} listKey="experiences" id={job.id} onChange={onChange}>
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
          <ItemCard key={entry.id} lang={lang} what={t("oneSchool")} index={i} count={cv.education.length} listKey="education" id={entry.id} onChange={onChange}>
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
          <ItemCard key={project.id} lang={lang} what={t("oneProject")} index={i} count={cv.projects.length} listKey="projects" id={project.id} onChange={onChange}>
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
          <ItemCard key={group.id} lang={lang} what={t("oneSkills")} index={i} count={cv.skills.length} listKey="skills" id={group.id} onChange={onChange}>
            <Field label={t("skillLabel")} value={group.label} onChange={(value) => onChange((c) => updateItem(c, "skills", group.id, { label: value }))} />
            <Field label={t("skillItems")} value={group.items} maxLength={LIMITS.skillItems} onChange={(value) => onChange((c) => updateItem(c, "skills", group.id, { items: value }))} />
          </ItemCard>
        ))}
        {cv.skills.length < LIMITS.skillGroups && addButton(t("addSkills"), () => onChange((c) => addItem(c, "skills", newSkillGroup(), LIMITS.skillGroups)))}
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
