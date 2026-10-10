import { describe, expect, it } from "vitest";

import { createAsset, type Asset } from "@/lib/workbench/asset";
import {
  capabilitiesFor,
  capabilityById,
  suggestOperation,
  type CapabilityId,
} from "@/lib/workbench/capabilities";
import type { AssetKind } from "@/lib/workbench/kinds";

function asset(kind: AssetKind, name = `file.${kind}`): Asset {
  return createAsset({ name, size: 0, arrayBuffer: async () => new ArrayBuffer(0) }, kind);
}

const enabledIds = (assets: readonly Asset[]): CapabilityId[] =>
  capabilitiesFor(assets).enabled.map((entry) => entry.capability.id);

describe("capabilitiesFor", () => {
  it("offers view, organize, split, unlock and export for a single PDF", () => {
    const ids = enabledIds([asset("pdf")]);
    expect(ids).toContain("viewer.view");
    expect(ids).toContain("doc.convert");
    expect(ids).toContain("pdf.organize");
    expect(ids).toContain("pdf.split");
    expect(ids).toContain("pdf.unlock");
    expect(ids).not.toContain("viewer.edit");
    expect(ids).not.toContain("image.convert");
    expect(ids).not.toContain("pdf.merge");
  });

  it("offers editing for editable kinds but not images or binaries", () => {
    expect(enabledIds([asset("markdown")])).toContain("viewer.edit");
    expect(enabledIds([asset("json")])).toContain("viewer.edit");
    expect(enabledIds([asset("sheet")])).toContain("viewer.edit");
    expect(enabledIds([asset("image")])).not.toContain("viewer.edit");
    expect(enabledIds([asset("binary")])).not.toContain("viewer.view");
  });

  it("does not offer viewer.edit for a multi-file selection", () => {
    expect(enabledIds([asset("markdown", "a.md"), asset("text", "b.txt")])).not.toContain(
      "viewer.edit",
    );
  });

  it("offers dedicated document and PDF editing", () => {
    expect(enabledIds([asset("docx")])).toContain("docx.edit");
    expect(enabledIds([asset("docx")])).not.toContain("viewer.edit");
    expect(enabledIds([asset("pdf")])).toContain("pdf.edit");
    expect(enabledIds([asset("pdf")])).not.toContain("viewer.edit");
    expect(enabledIds([asset("markdown")])).not.toContain("docx.edit");
  });

  it("promotes merge once two PDFs are open and diff once two texts are", () => {
    expect(suggestOperation([asset("pdf", "a.pdf"), asset("pdf", "b.pdf")])).toBe("pdf.merge");
    expect(suggestOperation([asset("text", "a.txt"), asset("text", "b.txt")])).toBe("text.diff");
  });

  it("infers the obvious first action for common single files", () => {
    expect(suggestOperation([asset("pdf")])).toBe("viewer.view");
    expect(suggestOperation([asset("image")])).toBe("image.convert");
    expect(suggestOperation([asset("json")])).toBe("viewer.view");
    expect(suggestOperation([asset("sheet")])).toBe("viewer.view");
    expect(suggestOperation([asset("markdown")])).toBe("viewer.view");
  });

  it("has no default action until something is open", () => {
    expect(suggestOperation([])).toBeNull();
  });

  it("explains why an unavailable action is disabled", () => {
    const set = capabilitiesFor([asset("pdf")]);
    expect(set.disabled.find((entry) => entry.capability.id === "pdf.merge")?.match.reason).toBe(
      "reasonNeedsTwoPdfs",
    );
    expect(set.disabled.find((entry) => entry.capability.id === "text.diff")?.match.reason).toBe(
      "reasonNeedsTwoFiles",
    );
    expect(set.disabled.find((entry) => entry.capability.id === "image.convert")?.match.reason).toBe(
      "reasonNeedsImage",
    );
  });

  it("groups enabled actions for the rail", () => {
    const groups = capabilitiesFor([asset("json")]).byGroup.map((entry) => entry.group);
    expect(groups).toContain("view");
    expect(groups).toContain("edit");
    expect(groups).toContain("convert");
    expect(groups).toContain("analyze");
  });

  it("marks the inferred actions as primary for a real selection", () => {
    const set = capabilitiesFor([asset("json")]);
    const primaries = set.enabled.filter((entry) => entry.primary);
    expect(primaries).toHaveLength(2);
    expect(primaries[0]!.capability.id).toBe("viewer.view");
    expect(primaries[1]!.capability.id).toBe("viewer.edit");
  });

  it("exposes UUID and QR generation with an empty selection", () => {
    const ids = enabledIds([]);
    expect(ids).toContain("data.uuid");
    expect(ids).toContain("qr.generate");
    expect(ids).toContain("qr.scan");
    expect(capabilitiesFor([]).suggested).toBeNull();
  });

  it("looks a capability up by id", () => {
    expect(capabilityById("pdf.merge")?.group).toBe("transform");
    expect(capabilityById("nope" as CapabilityId)).toBeUndefined();
  });
});
