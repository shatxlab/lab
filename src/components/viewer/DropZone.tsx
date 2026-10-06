import { Upload } from "lucide-react";

import { cn } from "@/lib/viewer/utils";

type DropZoneProps = {
  inputId: string;
  compact?: boolean;
  dragging?: boolean;
};

export function DropZone({ inputId, compact = false, dragging = false }: DropZoneProps) {
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-(--border) bg-(--surface)/40 text-center transition-colors hover:border-(--accent)/60 hover:bg-(--surface)/70",
        compact ? "px-6 py-8" : "px-8 py-16",
        dragging && "border-(--accent) bg-(--accent)/5",
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-(--surface) text-(--muted-fg) transition-colors group-hover:text-(--accent)",
          compact ? "size-10" : "size-14",
          dragging && "text-(--accent)",
        )}
      >
        <Upload className={compact ? "size-4" : "size-6"} />
      </span>

      <span className="flex flex-col gap-1">
        <span className="font-medium">
          {dragging ? "Drop to open" : "Drop a file here, or click to browse"}
        </span>
        <span className="text-sm text-(--muted-fg)">
          Markdown, Excel, CSV, Word, JSON and text &middot; you can also paste a file
        </span>
      </span>
    </label>
  );
}
