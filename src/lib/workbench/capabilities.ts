/**
 * The capability registry: the single source of truth for what the workbench
 * offers for the files that are open.
 *
 * The workbench always has one *selected* file. A capability is offered when
 * the selected file's kind is one it handles:
 *
 * - a **file** capability then works on the selected file alone (Open, Sign,
 *   Split, Read, Create QR);
 * - a **set** capability works on every open file of its kinds, and is only
 *   offered while that set has the right size (Merge needs 2+ PDFs, Compare
 *   exactly 2 comparable files, Image takes all open images as a batch).
 *
 * Tabs therefore always relate to the file the user is looking at, and mixed
 * selections (a spreadsheet next to a photo) never cancel each other out.
 *
 * This module is deliberately pure: no React, no heavy parser, no browser
 * global, so it can be unit-tested as a table.
 */

import type { AppLang } from "@/lib/apps/lang";
import type { Asset } from "@/lib/workbench/asset";
import { TEXTUAL_ASSET_KINDS, type AssetKind } from "@/lib/workbench/kinds";

export type Localized = Record<AppLang, string>;

export type CapabilityId =
  | "doc.open"
  | "book.read"
  | "image.edit"
  | "pdf.sign"
  | "pdf.split"
  | "pdf.merge"
  | "text.diff"
  | "qr.generate";

export interface Capability {
  id: CapabilityId;
  label: Localized;
  /** Higher sorts earlier; the first offered capability opens by default. */
  weight: number;
  /** Kinds of the selected file this capability is offered for. */
  kinds: ReadonlySet<AssetKind>;
  /**
   * Present for set capabilities: how many open files of `kinds` it needs.
   * The operation then receives all of them, in tray order.
   */
  set?: (count: number) => boolean;
  /** Also offered on the empty screen, working on typed input instead of files. */
  starter?: boolean;
}

const kinds = (...list: AssetKind[]): ReadonlySet<AssetKind> => new Set(list);

/** Kinds whose extracted text a line diff makes sense on (PDFs are view/merge/split/sign only). */
const COMPARE_KINDS = kinds("text", "markdown", "html", "json", "yaml", "toml", "sheet", "docx");

export const CAPABILITIES: readonly Capability[] = [
  {
    id: "pdf.merge",
    label: { en: "Merge PDFs", ru: "Склеить PDF" },
    weight: 1000,
    kinds: kinds("pdf"),
    set: (count) => count >= 2,
  },
  {
    id: "text.diff",
    label: { en: "Compare", ru: "Сравнить" },
    weight: 1000,
    kinds: COMPARE_KINDS,
    set: (count) => count === 2,
    starter: true,
  },
  {
    id: "book.read",
    label: { en: "Read", ru: "Читать" },
    weight: 900,
    kinds: kinds("epub"),
  },
  {
    id: "image.edit",
    label: { en: "Image", ru: "Изображение" },
    weight: 850,
    kinds: kinds("image"),
    set: (count) => count >= 1,
  },
  {
    id: "doc.open",
    label: { en: "Open", ru: "Открыть" },
    weight: 800,
    kinds: kinds("pdf", "docx", "markdown", "html", "text", "json", "yaml", "toml", "sheet"),
  },
  {
    id: "pdf.sign",
    label: { en: "Sign", ru: "Подписать" },
    weight: 770,
    kinds: kinds("pdf"),
  },
  {
    id: "pdf.split",
    label: { en: "Split", ru: "Разделить" },
    weight: 600,
    kinds: kinds("pdf"),
  },
  {
    id: "qr.generate",
    label: { en: "Create QR code", ru: "Создать QR-код" },
    weight: 320,
    kinds: TEXTUAL_ASSET_KINDS,
    starter: true,
  },
];

/** A capability offered for the current selection, with the files it acts on. */
export interface OfferedCapability {
  capability: Capability;
  assets: readonly Asset[];
}

function byWeight(a: Capability, b: Capability): number {
  return b.weight - a.weight || (a.id < b.id ? -1 : 1);
}

const SORTED = [...CAPABILITIES].sort(byWeight);

/** The open files a set capability would work on. */
function members(capability: Capability, assets: readonly Asset[]): Asset[] {
  return assets.filter((asset) => capability.kinds.has(asset.kind));
}

/** Everything offered for `selected` among the open `assets`, most relevant first. */
export function capabilitiesFor(assets: readonly Asset[], selected: Asset | null): OfferedCapability[] {
  if (!selected) return [];
  const offered: OfferedCapability[] = [];
  for (const capability of SORTED) {
    if (!capability.kinds.has(selected.kind)) continue;
    if (!capability.set) {
      offered.push({ capability, assets: [selected] });
      continue;
    }
    const group = members(capability, assets);
    if (capability.set(group.length)) offered.push({ capability, assets: group });
  }
  return offered;
}

/**
 * Set capabilities the selection is one file short of (one PDF → Merge, one
 * text → Compare). The shell shows them as a single hint, not dead buttons.
 */
export function unlockedByAnother(assets: readonly Asset[], selected: Asset | null): Capability[] {
  if (!selected) return [];
  return SORTED.filter((capability) => {
    if (!capability.set || !capability.kinds.has(selected.kind)) return false;
    const count = members(capability, assets).length;
    return !capability.set(count) && capability.set(count + 1);
  });
}

/** Capabilities offered on the empty screen, most relevant first. */
export const STARTERS: readonly Capability[] = SORTED.filter((capability) => capability.starter);

export function capabilityById(id: CapabilityId): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.id === id);
}
