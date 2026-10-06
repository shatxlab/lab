import * as React from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

import { Button } from "@/components/viewer/ui/button";
import { cn } from "@/lib/viewer/utils";

type SheetFindBarProps = {
  query: string;
  matchIndex: number;
  matchCount: number;
  onQueryChange: (query: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onEscape: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
};

export function SheetFindBar({
  query,
  matchIndex,
  matchCount,
  onQueryChange,
  onPrev,
  onNext,
  onEscape,
  inputRef,
}: SheetFindBarProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-(--border) px-3 py-2">
      <Search className="size-4 shrink-0 text-(--muted-fg)" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrev();
            else onNext();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            if (query.trim()) {
              event.stopPropagation();
              onEscape();
            }
          }
        }}
        placeholder="Find in sheet"
        aria-label="Find in sheet"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--muted-fg)"
      />
      <span className={cn("shrink-0 text-xs tabular-nums text-(--muted-fg)", !query.trim() && "invisible")}>
        {matchCount === 0 ? "No matches" : `${matchIndex + 1} of ${matchCount}`}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onPrev}
        disabled={matchCount === 0}
        aria-label="Previous match"
        className="size-8"
      >
        <ChevronUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={matchCount === 0}
        aria-label="Next match"
        className="size-8"
      >
        <ChevronDown />
      </Button>
    </div>
  );
}
