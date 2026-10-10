/**
 * `text.diff` — compare two texts. With two files open it compares their
 * content (spreadsheets as CSV, Word as text, JSON pretty-printed); on the
 * empty screen it compares two typed or pasted texts.
 */

import * as React from "react";
import { ArrowLeftRight, Trash2 } from "lucide-react";

import { DiffView } from "@/components/tools/DiffView";
import { ActionButton, labelClass, textareaClass } from "@/components/tools/ui";
import { tt } from "@/lib/text/i18n";
import { extractComparableText } from "@/lib/viewer/comparable";
import { cn } from "@/lib/viewer/utils";
import type { Asset } from "@/lib/workbench/asset";
import type { OperationProps } from "@/lib/workbench/operation";
import { useSeedAssets } from "@/lib/workbench/use-seed-assets";

function TextSide({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={cn(labelClass, "min-w-0")}>
      {label}
      <textarea
        className={cn(textareaClass, "min-h-56")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
    </label>
  );
}

/**
 * Text a line diff makes sense on: spreadsheets as CSV, Word as extracted
 * text, JSON pretty-printed. Anything the extractor refuses falls back to the
 * asset's decoded text.
 */
async function comparableText(asset: Asset): Promise<string> {
  try {
    return await extractComparableText(asset.source);
  } catch {
    return asset.text();
  }
}

export function TextDiffOperation({ lang, assets }: OperationProps) {
  const [left, setLeft] = React.useState("");
  const [right, setRight] = React.useState("");
  useSeedAssets(assets, async (list, isCancelled) => {
    const [nextLeft, nextRight] = await Promise.all([
      list[0] ? comparableText(list[0]) : "",
      list[1] ? comparableText(list[1]) : "",
    ]);
    if (isCancelled()) return;
    setLeft(nextLeft);
    setRight(nextRight);
  });
  const hasText = left !== "" || right !== "";
  const placeholder = tt(lang, "pasteHere");

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <TextSide label={assets[0]?.name ?? tt(lang, "original")} placeholder={placeholder} value={left} onChange={setLeft} />
        <TextSide label={assets[1]?.name ?? tt(lang, "modified")} placeholder={placeholder} value={right} onChange={setRight} />
      </div>
      <div className="flex gap-2">
        <ActionButton
          variant="secondary"
          onClick={() => {
            setLeft(right);
            setRight(left);
          }}
        >
          <ArrowLeftRight aria-hidden="true" className="size-4" />
          {tt(lang, "swap")}
        </ActionButton>
        <ActionButton
          variant="secondary"
          onClick={() => {
            setLeft("");
            setRight("");
          }}
          disabled={!hasText}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {tt(lang, "clear")}
        </ActionButton>
      </div>
      {hasText ? (
        <div className="overflow-hidden rounded-xl border border-(--border)">
          <DiffView
            lang={lang}
            leftName={assets[0]?.name ?? tt(lang, "original")}
            rightName={assets[1]?.name ?? tt(lang, "modified")}
            leftText={left}
            rightText={right}
          />
        </div>
      ) : (
        <p className="text-sm text-(--muted-fg)">{tt(lang, "diffEmpty")}</p>
      )}
    </>
  );
}
