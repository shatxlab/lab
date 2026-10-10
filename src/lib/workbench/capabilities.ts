/**
 * The capability registry: the single source of truth for what the workbench
 * can do with a given selection of assets.
 *
 * Each capability is a small declarative descriptor — a group, a label, a
 * weight and a `match` predicate. The UI is generated from these, so adding an
 * operation (or a format it applies to) means editing one record here instead
 * of threading another tab through a tool page.
 *
 * This module is deliberately pure: it never imports a React component, a
 * heavy parser, or a browser global, so `capabilitiesFor` can be unit-tested
 * as a table. Operations are wired to capability ids separately (Phase 1) so
 * the registry can describe them before their components exist.
 */

import type { AppLang } from "@/lib/apps/lang";
import type { Asset } from "@/lib/workbench/asset";
import { isComparable, isDataAssetKind, isEditable, isTextual, type AssetKind } from "@/lib/workbench/kinds";

export type Localized = Record<AppLang, string>;

export type CapabilityGroup =
  | "view"
  | "edit"
  | "convert"
  | "transform"
  | "analyze"
  | "secure"
  | "create"
  | "share";

export const CAPABILITY_GROUPS: readonly CapabilityGroup[] = [
  "view",
  "edit",
  "convert",
  "transform",
  "analyze",
  "secure",
  "create",
  "share",
];

/**
 * Why a capability is not available. Each value is also the workbench i18n
 * key, so the UI renders `wb(lang, match.reason)` with no extra mapping.
 */
export type MatchReason =
  | "reasonNeedsTwoFiles"
  | "reasonNeedsPdf"
  | "reasonNeedsTwoPdfs"
  | "reasonNeedsImage"
  | "reasonNeedsData"
  | "reasonNeedsText"
  | "reasonNeedsSheet"
  | "reasonNeedsDocument"
  | "reasonNeedsTextual";

export interface Match {
  ok: boolean;
  reason?: MatchReason;
}

export type CapabilityId =
  | "viewer.view"
  | "viewer.edit"
  | "viewer.print"
  | "docx.edit"
  | "pdf.edit"
  | "doc.convert"
  | "sheet.convert"
  | "data.convert"
  | "data.encode"
  | "data.hash"
  | "data.uuid"
  | "text.diff"
  | "text.count"
  | "text.case"
  | "text.regex"
  | "image.convert"
  | "image.transform"
  | "image.strip"
  | "pdf.merge"
  | "pdf.split"
  | "pdf.organize"
  | "pdf.unlock"
  | "qr.generate"
  | "qr.scan";

export interface Capability {
  id: CapabilityId;
  group: CapabilityGroup;
  label: Localized;
  /** Higher weight sorts earlier; the top entries become the default action. */
  weight: number;
  match(assets: readonly Asset[]): Match;
}

const DOCUMENT_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>(["pdf", "docx", "markdown", "html"]);
const PRINTABLE_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>(["markdown", "html", "docx", "text"]);

function kindOf(assets: readonly Asset[]): AssetKind {
  const first = assets[0];
  if (!first) throw new Error("kindOf: expected at least one asset");
  return first.kind;
}

const only = (assets: readonly Asset[]): boolean => assets.length === 1;

const every = (assets: readonly Asset[], predicate: (kind: AssetKind) => boolean): boolean =>
  assets.length > 0 && assets.every((asset) => predicate(asset.kind));

const everySet = (assets: readonly Asset[], set: ReadonlySet<AssetKind>): boolean =>
  every(assets, (kind) => set.has(kind));

const isPdf = (kind: AssetKind): boolean => kind === "pdf";
const isImage = (kind: AssetKind): boolean => kind === "image";

export const CAPABILITIES: readonly Capability[] = [
  /* --------------------------------------------------------------- view */
  {
    id: "viewer.view",
    group: "view",
    label: { en: "View", ru: "Просмотр" },
    weight: 800,
    match: (assets) => ({ ok: every(assets, (kind) => kind !== "binary"), reason: "reasonNeedsDocument" }),
  },
  {
    id: "viewer.edit",
    group: "edit",
    label: { en: "Edit", ru: "Редактировать" },
    weight: 780,
    match: (assets) => ({ ok: only(assets) && every(assets, isEditable), reason: "reasonNeedsTextual" }),
  },
  {
    id: "docx.edit",
    group: "edit",
    label: { en: "Edit document", ru: "Редактировать документ" },
    weight: 770,
    match: (assets) => ({ ok: only(assets) && kindOf(assets) === "docx", reason: "reasonNeedsDocument" }),
  },
  {
    id: "pdf.edit",
    group: "edit",
    label: { en: "Edit PDF", ru: "Редактировать PDF" },
    weight: 770,
    match: (assets) => ({ ok: only(assets) && isPdf(kindOf(assets)), reason: "reasonNeedsPdf" }),
  },

  /* ------------------------------------------------------------ convert */
  {
    id: "data.convert",
    group: "convert",
    label: { en: "Convert data", ru: "Конвертировать данные" },
    weight: 750,
    match: (assets) => ({ ok: only(assets) && isDataAssetKind(kindOf(assets)), reason: "reasonNeedsData" }),
  },
  {
    id: "doc.convert",
    group: "convert",
    label: { en: "Export document", ru: "Экспорт документа" },
    weight: 680,
    match: (assets) => ({ ok: only(assets) && DOCUMENT_KINDS.has(kindOf(assets)), reason: "reasonNeedsDocument" }),
  },
  {
    id: "sheet.convert",
    group: "convert",
    label: { en: "Export spreadsheet", ru: "Экспорт таблицы" },
    weight: 700,
    match: (assets) => ({ ok: only(assets) && kindOf(assets) === "sheet", reason: "reasonNeedsSheet" }),
  },
  {
    id: "image.convert",
    group: "convert",
    label: { en: "Convert image", ru: "Конвертировать изображение" },
    weight: 850,
    match: (assets) => ({ ok: only(assets) && isImage(kindOf(assets)), reason: "reasonNeedsImage" }),
  },
  {
    id: "data.encode",
    group: "convert",
    label: { en: "Encode / decode", ru: "Кодировать / декодировать" },
    weight: 300,
    match: (assets) => ({ ok: only(assets), reason: "reasonNeedsDocument" }),
  },

  /* ---------------------------------------------------------- transform */
  {
    id: "image.transform",
    group: "transform",
    label: { en: "Resize & compress", ru: "Размер и сжатие" },
    weight: 740,
    match: (assets) => ({ ok: only(assets) && isImage(kindOf(assets)), reason: "reasonNeedsImage" }),
  },
  {
    id: "text.case",
    group: "transform",
    label: { en: "Change case", ru: "Сменить регистр" },
    weight: 380,
    match: (assets) => ({ ok: only(assets) && isTextual(kindOf(assets)), reason: "reasonNeedsText" }),
  },
  {
    id: "text.regex",
    group: "transform",
    label: { en: "Regex", ru: "Regex" },
    weight: 380,
    match: (assets) => ({ ok: only(assets) && isTextual(kindOf(assets)), reason: "reasonNeedsText" }),
  },
  {
    id: "pdf.merge",
    group: "transform",
    label: { en: "Merge PDFs", ru: "Склеить PDF" },
    weight: 1000,
    match: (assets) => ({
      ok: assets.length >= 2 && assets.every((asset) => isPdf(asset.kind)),
      reason: "reasonNeedsTwoPdfs",
    }),
  },
  {
    id: "pdf.split",
    group: "transform",
    label: { en: "Split PDF", ru: "Разделить PDF" },
    weight: 600,
    match: (assets) => ({ ok: only(assets) && isPdf(kindOf(assets)), reason: "reasonNeedsPdf" }),
  },
  {
    id: "pdf.organize",
    group: "transform",
    label: { en: "Organize pages", ru: "Страницы" },
    weight: 660,
    match: (assets) => ({ ok: only(assets) && isPdf(kindOf(assets)), reason: "reasonNeedsPdf" }),
  },

  /* ------------------------------------------------------------ analyze */
  {
    id: "text.diff",
    group: "analyze",
    label: { en: "Compare", ru: "Сравнить" },
    weight: 1000,
    match: (assets) => ({
      ok: assets.length >= 2 && assets.every((asset) => isComparable(asset.kind)),
      reason: "reasonNeedsTwoFiles",
    }),
  },
  {
    id: "text.count",
    group: "analyze",
    label: { en: "Count", ru: "Подсчёт" },
    weight: 420,
    match: (assets) => ({ ok: only(assets) && isTextual(kindOf(assets)), reason: "reasonNeedsText" }),
  },
  {
    id: "data.hash",
    group: "analyze",
    label: { en: "Hash", ru: "Хеш" },
    weight: 300,
    match: (assets) => ({ ok: only(assets), reason: "reasonNeedsDocument" }),
  },

  /* ------------------------------------------------------------- secure */
  {
    id: "image.strip",
    group: "secure",
    label: { en: "Strip metadata", ru: "Удалить метаданные" },
    weight: 560,
    match: (assets) => ({ ok: only(assets) && isImage(kindOf(assets)), reason: "reasonNeedsImage" }),
  },
  {
    id: "pdf.unlock",
    group: "secure",
    label: { en: "Unlock PDF", ru: "Снять защиту" },
    weight: 520,
    match: (assets) => ({ ok: only(assets) && isPdf(kindOf(assets)), reason: "reasonNeedsPdf" }),
  },

  /* ------------------------------------------------------------- create */
  {
    id: "qr.generate",
    group: "create",
    label: { en: "Create QR code", ru: "Создать QR-код" },
    weight: 320,
    match: (assets) => {
      if (assets.length === 0) return { ok: true };
      if (only(assets) && isTextual(kindOf(assets))) return { ok: true };
      return { ok: false, reason: "reasonNeedsTextual" };
    },
  },
  {
    id: "qr.scan",
    group: "create",
    label: { en: "Scan QR code", ru: "Сканировать QR-код" },
    weight: 600,
    match: (assets) => {
      if (assets.length === 0) return { ok: true };
      if (only(assets) && isImage(kindOf(assets))) return { ok: true };
      return { ok: false, reason: "reasonNeedsImage" };
    },
  },
  {
    id: "data.uuid",
    group: "create",
    label: { en: "Generate UUID", ru: "Создать UUID" },
    weight: 200,
    match: () => ({ ok: true }),
  },

  /* -------------------------------------------------------------- share */
  {
    id: "viewer.print",
    group: "share",
    label: { en: "Print / save as PDF", ru: "Печать / сохранить в PDF" },
    weight: 640,
    match: (assets) => ({ ok: everySet(assets, PRINTABLE_KINDS), reason: "reasonNeedsDocument" }),
  },
];

export interface CapabilityMatch {
  capability: Capability;
  match: Match;
  /** Effective weight, copied out so callers don't reach through `capability`. */
  weight: number;
  /** One of the top inferred actions; the UI renders these as buttons. */
  primary: boolean;
}

export interface CapabilityGroupMatches {
  group: CapabilityGroup;
  items: CapabilityMatch[];
}

export interface CapabilitySet {
  enabled: CapabilityMatch[];
  disabled: CapabilityMatch[];
  /** Enabled capabilities grouped for the action rail (empty groups removed). */
  byGroup: CapabilityGroupMatches[];
  /** The inferred default action, or null when nothing is open. */
  suggested: CapabilityMatch | null;
}

/** How many enabled capabilities are promoted to primary buttons. */
export const PRIMARY_COUNT = 2;

/** Resolve every capability against a selection, ordered by relevance. */
export function capabilitiesFor(assets: readonly Asset[]): CapabilitySet {
  const all: CapabilityMatch[] = CAPABILITIES.map((capability) => ({
    capability,
    match: capability.match(assets),
    weight: capability.weight,
    primary: false,
  }));

  const enabled = all
    .filter((entry) => entry.match.ok)
    .sort((a, b) => b.weight - a.weight || (a.capability.id < b.capability.id ? -1 : 1));

  // Create tools (UUID, QR) also apply to an empty selection; only a real
  // selection gets promoted actions, so the empty state stays a drop zone.
  if (assets.length > 0) {
    for (let index = 0; index < enabled.length && index < PRIMARY_COUNT; index += 1) {
      enabled[index]!.primary = true;
    }
  }

  const disabled = all.filter((entry) => !entry.match.ok);

  const byGroup = CAPABILITY_GROUPS.map((group) => ({
    group,
    items: enabled.filter((entry) => entry.capability.group === group),
  })).filter((entry) => entry.items.length > 0);

  return {
    enabled,
    disabled,
    byGroup,
    suggested: assets.length > 0 ? (enabled[0] ?? null) : null,
  };
}

/** The id of the operation a fresh drop should open, or null when empty. */
export function suggestOperation(assets: readonly Asset[]): CapabilityId | null {
  return capabilitiesFor(assets).suggested?.capability.id ?? null;
}

export function capabilityById(id: CapabilityId): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.id === id);
}
