/**
 * Bridges capability ids to their lazily-loaded operation components.
 *
 * Capabilities describe *what* can be done (pure metadata); this registry
 * says *how* to render it. Every value is a dynamic import, so a capability
 * that is shown but not used never pulls its code in — the same deferral the
 * viewer already applies to PDF.js, SheetJS and mammoth.
 */

import type { CapabilityId } from "@/lib/workbench/capabilities";
import type { OperationComponent } from "@/lib/workbench/operation";

export type OperationLoader = () => Promise<OperationComponent>;

const REGISTRY: Record<CapabilityId, OperationLoader> = {
  "doc.open": async () => (await import("@/components/workbench/operations/OpenOperations")).OpenOperation,
  "book.read": async () => (await import("@/components/workbench/operations/ReaderOperations")).BookReadOperation,
  "image.edit": async () => (await import("@/components/workbench/operations/ImageOperations")).ImageOperation,
  "pdf.sign": async () => (await import("@/components/workbench/operations/PdfSignOperations")).PdfSignOperation,
  "pdf.split": async () => (await import("@/components/workbench/operations/PdfOperations")).PdfSplitOperation,
  "pdf.merge": async () => (await import("@/components/workbench/operations/PdfOperations")).PdfMergeOperation,
  "text.diff": async () => (await import("@/components/workbench/operations/TextOperations")).TextDiffOperation,
  "qr.generate": async () => (await import("@/components/workbench/operations/QrOperations")).QrGenerateOperation,
};

/** Whether an operation component exists for a capability id. */
export function hasOperation(id: CapabilityId): boolean {
  return Object.hasOwn(REGISTRY, id);
}

export async function loadOperation(id: CapabilityId): Promise<OperationComponent | null> {
  return hasOperation(id) ? REGISTRY[id]() : null;
}
