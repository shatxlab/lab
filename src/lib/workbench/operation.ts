/**
 * The contract every workbench operation implements.
 *
 * An operation is a plain React component that receives the assets selected
 * for it and, when it produces a document, hands it back through `onProduce`
 * so the shell can offer it in the Outputs tray. Parameters live in the shell
 * (persisted per capability id), so an operation is stateless with respect to
 * everything except its own draft while typing.
 *
 * The optional fields keep an operation usable on its own — the legacy tool
 * pages render the same components with no assets, params or output sink.
 */

import type { ComponentType } from "react";

import type { AppLang } from "@/lib/apps/lang";
import type { Asset } from "@/lib/workbench/asset";
import type { AssetKind } from "@/lib/workbench/kinds";

export interface OperationOutput {
  /** Suggested filename, e.g. `report.csv`. */
  name: string;
  /** MIME type used to build the download Blob. */
  type: string;
  bytes: Uint8Array;
  /** The asset kind the bytes represent, for reopening or chaining. */
  kind?: AssetKind;
}

export interface OperationProps {
  lang: AppLang;
  /** Inputs selected for this operation, in order. */
  assets: readonly Asset[];
  /** Persisted parameters for this capability, when hosted by the shell. */
  params?: Record<string, unknown>;
  setParams?: (patch: Record<string, unknown>) => void;
  /** Publish a result into the Outputs tray. */
  onProduce?: (output: OperationOutput) => void;
  /** True while the shell is running another operation. */
  busy?: boolean;
  /**
   * Report unsaved work. While dirty, the shell never switches away on its
   * own and asks before the user does.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

export type OperationComponent = ComponentType<OperationProps>;

/** Shared empty selection for starters, which run on typed input. */
export const EMPTY_ASSETS: readonly Asset[] = [];
