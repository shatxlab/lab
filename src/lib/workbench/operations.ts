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

const REGISTRY: Partial<Record<CapabilityId, OperationLoader>> = {
  "data.convert": async () =>
    (await import("@/components/workbench/operations/ConvertOperations")).DataConvertOperation,
  "data.encode": async () =>
    (await import("@/components/workbench/operations/ConvertOperations")).DataEncodeOperation,
  "data.hash": async () =>
    (await import("@/components/workbench/operations/ConvertOperations")).DataHashOperation,
  "data.uuid": async () =>
    (await import("@/components/workbench/operations/ConvertOperations")).DataUuidOperation,
  "text.diff": async () =>
    (await import("@/components/workbench/operations/TextOperations")).TextDiffOperation,
  "text.count": async () =>
    (await import("@/components/workbench/operations/TextOperations")).TextCountOperation,
  "text.case": async () =>
    (await import("@/components/workbench/operations/TextOperations")).TextCaseOperation,
  "text.regex": async () =>
    (await import("@/components/workbench/operations/TextOperations")).TextRegexOperation,
  "qr.generate": async () =>
    (await import("@/components/workbench/operations/QrOperations")).QrGenerateOperation,
  "qr.scan": async () =>
    (await import("@/components/workbench/operations/QrOperations")).QrScanOperation,
  "pdf.merge": async () =>
    (await import("@/components/workbench/operations/PdfOperations")).PdfMergeOperation,
  "pdf.split": async () =>
    (await import("@/components/workbench/operations/PdfOperations")).PdfSplitOperation,
  "pdf.organize": async () =>
    (await import("@/components/workbench/operations/PdfOperations")).PdfOrganizeOperation,
  "image.convert": async () =>
    (await import("@/components/workbench/operations/ImageOperations")).ImageOperation,
  "image.transform": async () =>
    (await import("@/components/workbench/operations/ImageOperations")).ImageOperation,
  "image.strip": async () =>
    (await import("@/components/workbench/operations/ImageOperations")).ImageOperation,
  "viewer.view": async () =>
    (await import("@/components/workbench/operations/ViewerOperations")).ViewerViewOperation,
  "viewer.edit": async () =>
    (await import("@/components/workbench/operations/ViewerOperations")).ViewerEditOperation,
  "docx.edit": async () =>
    (await import("@/components/workbench/operations/DocxOperations")).DocxEditOperation,
  "pdf.edit": async () =>
    (await import("@/components/workbench/operations/PdfEditOperations")).PdfEditOperation,
  "doc.convert": async () =>
    (await import("@/components/workbench/operations/ViewerOperations")).ViewerConvertOperation,
  "sheet.convert": async () =>
    (await import("@/components/workbench/operations/ViewerOperations")).ViewerConvertOperation,
  "viewer.print": async () =>
    (await import("@/components/workbench/operations/ViewerOperations")).ViewerPrintOperation,
};

export function operationLoader(id: CapabilityId): OperationLoader | undefined {
  return REGISTRY[id];
}

/** Whether an operation component exists yet for a capability. */
export function hasOperation(id: CapabilityId): boolean {
  return REGISTRY[id] !== undefined;
}

export async function loadOperation(id: CapabilityId): Promise<OperationComponent | null> {
  const loader = REGISTRY[id];
  return loader ? loader() : null;
}
