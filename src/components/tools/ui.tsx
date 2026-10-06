import * as React from "react";
import { Check, Copy, Upload } from "lucide-react";

import type { AppLang } from "@/lib/apps/lang";
import { tc } from "@/lib/apps/common-i18n";
import { useLangReady } from "@/lib/apps/use-app-lang";
import { cn } from "@/lib/viewer/utils";

/** Shared Tailwind class strings so every small tool looks the same. */
export const inputClass =
  "w-full rounded-md border border-(--border) bg-(--bg) px-3 py-2 text-sm text-(--fg) placeholder:text-(--muted-fg) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:opacity-50";
export const textareaClass = `${inputClass} min-h-40 resize-y font-mono leading-relaxed`;
export const labelClass = "flex flex-col gap-1 text-sm font-medium text-(--fg)";
export const panelClass = "rounded-xl border border-(--border) bg-(--surface) p-4";

type ToolPageProps = {
  title: string;
  tagline: string;
  children: React.ReactNode;
  /** Wider layout for tools with side-by-side panes. */
  wide?: boolean;
};

/** Page frame: heading, one-line tagline and the language-paint guard. */
export function ToolPage({ title, tagline, children, wide = false }: ToolPageProps) {
  const readyRef = useLangReady<HTMLDivElement>();
  return (
    <div
      ref={readyRef}
      data-lang-sensitive=""
      className={cn("mx-auto flex w-full flex-1 flex-col gap-5 px-[18px] py-8", wide ? "max-w-6xl" : "max-w-3xl")}
    >
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold text-(--fg)">{title}</h1>
        <p className="text-sm text-(--muted-fg)">{tagline}</p>
      </header>
      {children}
    </div>
  );
}

type FilePickerProps = {
  lang: AppLang;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  /** Override the default prompt line. */
  prompt?: string;
  hint?: string;
  compact?: boolean;
  id?: string;
};

/**
 * Accessible file drop zone: a real `<input type="file">` (keyboard and screen
 * reader friendly) visually hidden inside a label that also takes drops.
 */
export function FilePicker({ lang, accept, multiple = false, onFiles, prompt, hint, compact = false, id }: FilePickerProps) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const reactId = React.useId();
  const inputId = id ?? `file-${reactId}`;

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        take(event.dataTransfer?.files ?? null);
      }}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-(--border) bg-(--surface)/40 text-center transition-colors hover:border-(--accent)/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--accent)",
        compact ? "px-4 py-6" : "px-6 py-12",
        dragging && "border-(--accent) bg-(--accent)/5",
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          // Allow re-picking the same file.
          event.target.value = "";
        }}
      />
      <Upload aria-hidden="true" className="size-6 text-(--muted-fg) group-hover:text-(--accent)" />
      <span className="font-medium">
        {dragging ? tc(lang, "dropActive") : (prompt ?? tc(lang, multiple ? "dropFiles" : "dropFile"))}
      </span>
      {hint && <span className="text-sm text-(--muted-fg)">{hint}</span>}
    </label>
  );
}

type CopyButtonProps = {
  lang: AppLang;
  text: string;
  className?: string;
  label?: string;
  disabled?: boolean;
};

/** Copy-to-clipboard button that announces the result to screen readers. */
export function CopyButton({ lang, text, className, label, disabled }: CopyButtonProps) {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1600);
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        disabled={disabled}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md border border-(--border) bg-(--bg) px-3 text-xs font-medium text-(--fg) transition-colors hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) disabled:opacity-50",
          className,
        )}
      >
        {state === "copied" ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
        {label ?? tc(lang, "copy")}
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? tc(lang, "copied") : state === "failed" ? tc(lang, "copyFailed") : ""}
      </span>
    </>
  );
}

type TabsProps<T extends string> = {
  label: string;
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  idPrefix: string;
};

/**
 * Accessible tab strip (WAI-ARIA tabs pattern): roving tabindex, arrow/Home/End
 * keys. Panels are rendered by the caller with `role="tabpanel"` and
 * `id={`${idPrefix}-panel-${id}`}`.
 */
export function Tabs<T extends string>({ label, tabs, value, onChange, idPrefix }: TabsProps<T>) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    refs.current[target.id]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-1 border-b border-(--border)">
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "-mb-px rounded-t-md border-b-2 px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)",
              active
                ? "border-(--accent) text-(--accent)"
                : "border-transparent text-(--muted-fg) hover:text-(--fg)",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled `<select>` with the shared styling. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={cn(labelClass, className)}>
      {label}
      <select className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Shared primary/secondary action button. */
export function ActionButton({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:pointer-events-none disabled:opacity-50",
        variant === "primary"
          ? "bg-(--accent) text-(--accent-fg) hover:bg-(--accent)/90"
          : "border border-(--border) bg-(--bg) text-(--fg) hover:bg-(--surface)",
        className,
      )}
    />
  );
}
