/**
 * The text operation family, extracted from the old Text tools tabs.
 *
 * Every operation is asset-aware: when the workbench hands it files, it seeds
 * its draft from their text and hides the file picker. Rendered on its own
 * from the legacy `/text` page (no assets), it behaves exactly as before.
 */

import * as React from "react";
import { ArrowLeftRight, Trash2 } from "lucide-react";

import { DiffView } from "@/components/tools/DiffView";
import {
  ActionButton,
  CopyButton,
  FilePicker,
  inputClass,
  labelClass,
  panelClass,
  textareaClass,
} from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { formatBytesLimit } from "@/lib/limits";
import { CASE_MODES, convertCase, type CaseMode } from "@/lib/text/case";
import { tt } from "@/lib/text/i18n";
import { testRegex, type RegexMatch, type RegexResponse } from "@/lib/text/regex";
import { analyzeText, splitDuration, topWords } from "@/lib/text/stats";
import type { OperationProps } from "@/lib/workbench/operation";
import { useSeedAssets } from "@/lib/workbench/use-seed-assets";
import { cn } from "@/lib/viewer/utils";

/** Text files above this are refused so the page stays responsive. */
const MAX_TEXT_FILE_BYTES = 4 * 1024 * 1024;

async function readTextFile(file: File, lang: AppLang): Promise<{ text: string } | { error: string }> {
  if (file.size > MAX_TEXT_FILE_BYTES) {
    return { error: tt(lang, "fileTooLarge", { limit: formatBytesLimit(MAX_TEXT_FILE_BYTES) }) };
  }
  const text = await file.text();
  // A NUL byte almost always means a binary file.
  if (text.includes("\u0000")) return { error: tt(lang, "fileNotText") };
  return { text };
}

/* ------------------------------------------------------------------ shared */

function TextSide({
  lang,
  label,
  value,
  onChange,
  showFilePicker = true,
}: {
  lang: AppLang;
  label: string;
  value: string;
  onChange: (value: string) => void;
  showFilePicker?: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label className={labelClass}>
        {label}
        <textarea
          className={cn(textareaClass, "min-h-56")}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={tt(lang, "pasteHere")}
          spellCheck={false}
        />
      </label>
      {showFilePicker && (
        <FilePicker
          lang={lang}
          accept="text/*,.json,.md,.csv,.tsv,.log,.xml,.yaml,.yml,.toml,.js,.ts,.jsx,.tsx,.css,.html,.py,.sh,.sql,.ini"
          prompt={tt(lang, "loadFile")}
          compact
          onFiles={async ([file]) => {
            if (!file) return;
            setError(null);
            const result = await readTextFile(file, lang);
            if ("error" in result) setError(result.error);
            else onChange(result.text);
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-(--warning)">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ diff */

export function TextDiffOperation({ lang, assets }: OperationProps) {
  const [left, setLeft] = React.useState("");
  const [right, setRight] = React.useState("");
  useSeedAssets(assets, async (list) => {
    setLeft(list[0] ? await list[0].text() : "");
    setRight(list[1] ? await list[1].text() : "");
  });
  const standalone = assets.length === 0;
  const hasText = left !== "" || right !== "";

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <TextSide lang={lang} label={tt(lang, "original")} value={left} onChange={setLeft} showFilePicker={standalone} />
        <TextSide lang={lang} label={tt(lang, "modified")} value={right} onChange={setRight} showFilePicker={standalone} />
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
          <DiffView lang={lang} leftName={tt(lang, "original")} rightName={tt(lang, "modified")} leftText={left} rightText={right} />
        </div>
      ) : (
        <p className="text-sm text-(--muted-fg)">{tt(lang, "diffEmpty")}</p>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- count */

function formatMinutes(lang: AppLang, minutes: number): string {
  const { minutes: m, seconds } = splitDuration(minutes);
  return m === 0 ? tt(lang, "underMinute", { seconds }) : tt(lang, "minSec", { minutes: m, seconds });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function TextCountOperation({ lang, assets }: OperationProps) {
  const [text, setText] = React.useState("");
  useSeedAssets(assets, async (list) => {
    setText(list[0] ? await list[0].text() : "");
  });
  const standalone = assets.length === 0;
  const deferred = React.useDeferredValue(text);
  const stats = React.useMemo(() => analyzeText(deferred), [deferred]);
  const words = React.useMemo(() => topWords(deferred, 10), [deferred]);
  const fmt = new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-US");

  const rows: [string, string][] = [
    [tt(lang, "statCharacters"), fmt.format(stats.characters)],
    [tt(lang, "statCharactersNoSpaces"), fmt.format(stats.charactersNoSpaces)],
    [tt(lang, "statWords"), fmt.format(stats.words)],
    [tt(lang, "statSentences"), fmt.format(stats.sentences)],
    [tt(lang, "statParagraphs"), fmt.format(stats.paragraphs)],
    [tt(lang, "statLines"), fmt.format(stats.lines)],
    [tt(lang, "statBytes"), formatBytes(stats.bytes)],
    [tt(lang, "statReading"), formatMinutes(lang, stats.readingMinutes)],
    [tt(lang, "statSpeaking"), formatMinutes(lang, stats.speakingMinutes)],
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <TextSide lang={lang} label={tt(lang, "countInput")} value={text} onChange={setText} showFilePicker={standalone} />
      <div className="flex flex-col gap-4">
        <dl className={cn(panelClass, "grid grid-cols-2 gap-x-4 gap-y-3")}>
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs text-(--muted-fg)">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <section className={panelClass} aria-labelledby="top-words-title">
          <h2 id="top-words-title" className="mb-2 text-sm font-semibold">
            {tt(lang, "topWords")}
          </h2>
          {words.length === 0 ? (
            <p className="text-sm text-(--muted-fg)">{tt(lang, "noWords")}</p>
          ) : (
            <ol className="flex flex-col gap-1 text-sm">
              {words.map((entry) => (
                <li key={entry.word} className="flex justify-between gap-3">
                  <span className="truncate">{entry.word}</span>
                  <span className="tabular-nums text-(--muted-fg)">
                    {tt(lang, "times")} {entry.count}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ case */

export function TextCaseOperation({ lang, assets }: OperationProps) {
  const [text, setText] = React.useState("");
  const [mode, setMode] = React.useState<CaseMode>("upper");
  useSeedAssets(assets, async (list) => {
    setText(list[0] ? await list[0].text() : "");
  });
  const standalone = assets.length === 0;
  const result = React.useMemo(() => convertCase(text, mode), [text, mode]);

  return (
    <>
      <TextSide lang={lang} label={tt(lang, "caseInput")} value={text} onChange={setText} showFilePicker={standalone} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{tt(lang, "caseMode")}</legend>
        <div className="flex flex-wrap gap-2">
          {CASE_MODES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "h-9 rounded-md border px-3 text-sm transition-colors",
                mode === value ? "border-(--accent) bg-(--accent)/10 font-medium text-(--accent)" : "border-(--border) bg-(--bg) hover:bg-(--surface)",
              )}
            >
              {tt(lang, value === "title" ? "titleCase" : value)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <label className={labelClass}>
          {tt(lang, "caseResult")}
          <textarea className={cn(textareaClass, "min-h-40")} value={result} readOnly spellCheck={false} />
        </label>
        <div className="flex gap-2">
          <CopyButton lang={lang} text={result} disabled={result === ""} />
          <ActionButton variant="secondary" className="h-8 px-3 text-xs" onClick={() => setText(result)} disabled={result === ""}>
            {tt(lang, "useAsInput")}
          </ActionButton>
        </div>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- regex */

const FLAG_OPTIONS = ["g", "i", "m", "s", "u"] as const;
const MAX_HIGHLIGHTS = 400;

function highlightSegments(text: string, matches: readonly RegexMatch[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let at = 0;
  let used = 0;
  for (const match of matches) {
    if (match.end === match.index || match.index < at) continue;
    if (used >= MAX_HIGHLIGHTS) break;
    if (match.index > at) nodes.push(text.slice(at, match.index));
    nodes.push(
      <mark key={match.index} className="rounded-sm bg-(--accent)/25 text-inherit outline outline-1 outline-(--accent)/40">
        {match.text}
      </mark>,
    );
    at = match.end;
    used += 1;
  }
  nodes.push(text.slice(at));
  return nodes;
}

export function TextRegexOperation({ lang, assets }: OperationProps) {
  const [pattern, setPattern] = React.useState("");
  const [flags, setFlags] = React.useState<string[]>(["g"]);
  const [text, setText] = React.useState("");
  const [replacement, setReplacement] = React.useState("");
  const [response, setResponse] = React.useState<RegexResponse | { ok: false; error: "timeout" } | null>(null);
  useSeedAssets(assets, async (list) => {
    setText(list[0] ? await list[0].text() : "");
  });

  const debounced = useDebounced({ pattern, flags: flags.join(""), text, replacement }, 200);

  React.useEffect(() => {
    if (debounced.pattern === "") {
      setResponse(null);
      return;
    }
    let cancelled = false;
    void testRegex({
      pattern: debounced.pattern,
      flags: debounced.flags,
      text: debounced.text,
      replacement: debounced.replacement === "" ? undefined : debounced.replacement,
    }).then((result) => {
      if (!cancelled) setResponse(result);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const toggleFlag = (flag: string) => setFlags((current) => (current.includes(flag) ? current.filter((f) => f !== flag) : [...current, flag]));

  const errorText = (() => {
    if (!response || response.ok) return null;
    if (response.error === "timeout") return tt(lang, "regexTimeout");
    if (response.error === "text-too-large") return tt(lang, "regexTooLarge");
    return tt(lang, "regexError", { message: response.error });
  })();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <label className={labelClass}>
          {tt(lang, "regexPattern")}
          <input
            className={cn(inputClass, "font-mono")}
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="(\\w+)@(\\w+\\.\\w+)"
            aria-invalid={errorText !== null && response?.ok === false && response.error !== "timeout"}
          />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">{tt(lang, "regexFlags")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {FLAG_OPTIONS.map((flag) => (
              <label key={flag} className="flex items-center gap-1.5 text-sm" title={tt(lang, `flag${flag.toUpperCase()}` as "flagG")}>
                <input type="checkbox" checked={flags.includes(flag)} onChange={() => toggleFlag(flag)} />
                <code>{flag}</code>
                <span className="hidden text-xs text-(--muted-fg) sm:inline">{tt(lang, `flag${flag.toUpperCase()}` as "flagG")}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className={labelClass}>
          {tt(lang, "regexText")}
          <textarea className={cn(textareaClass, "min-h-44")} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
        </label>
        <label className={labelClass}>
          {tt(lang, "regexReplace")}
          <input className={cn(inputClass, "font-mono")} value={replacement} onChange={(event) => setReplacement(event.target.value)} spellCheck={false} aria-describedby="regex-replace-hint" />
          <span id="regex-replace-hint" className="text-xs font-normal text-(--muted-fg)">
            {tt(lang, "regexReplaceHint")}
          </span>
        </label>
        <ActionButton
          variant="secondary"
          className="self-start"
          onClick={() => {
            setPattern("(\\w+)@(\\w+\\.\\w+)");
            setText("Write to bob@example.com or ann@mail.org today.");
            setReplacement("$2 ← $1");
            setFlags(["g", "i"]);
          }}
        >
          {tt(lang, "regexSample")}
        </ActionButton>
      </div>

      <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
        {errorText && (
          <p role="alert" className="rounded-lg border border-(--warning)/40 bg-(--warning)/10 p-3 text-sm text-(--warning)">
            {errorText}
          </p>
        )}
        {response?.ok && (
          <>
            <p className="text-sm font-medium">
              {response.matches.length === 0
                ? tt(lang, "regexNoMatches")
                : response.matches.length === 1 && !response.truncated
                  ? tt(lang, "regexMatchesOne")
                  : tt(lang, "regexMatches", { count: response.matches.length })}
              {response.truncated && <span className="ml-2 font-normal text-(--muted-fg)">{tt(lang, "regexTruncated", { count: response.matches.length })}</span>}
            </p>
            <section aria-labelledby="regex-highlight" className={panelClass}>
              <h2 id="regex-highlight" className="mb-2 text-sm font-semibold">
                {tt(lang, "regexHighlight")}
              </h2>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-sm">{highlightSegments(debounced.text, response.matches)}</pre>
            </section>
            {response.replaced !== undefined && (
              <section aria-labelledby="regex-result" className={panelClass}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 id="regex-result" className="text-sm font-semibold">
                    {tt(lang, "regexResult")}
                  </h2>
                  <CopyButton lang={lang} text={response.replaced} />
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-sm">{response.replaced}</pre>
              </section>
            )}
            {response.matches.length > 0 && (
              <section aria-labelledby="regex-list" className={panelClass}>
                <h2 id="regex-list" className="mb-2 text-sm font-semibold">
                  {tt(lang, "regexList")}
                </h2>
                <ol className="flex max-h-72 flex-col gap-2 overflow-auto text-sm">
                  {response.matches.slice(0, 100).map((match, index) => (
                    <li key={`${match.index}-${index}`} className="rounded-md border border-(--border) bg-(--bg) p-2">
                      <div className="flex justify-between gap-2">
                        <code className="break-all">{match.text === "" ? "∅" : match.text}</code>
                        <span className="shrink-0 text-xs text-(--muted-fg)">{tt(lang, "regexAt", { index: match.index })}</span>
                      </div>
                      {match.groups.length > 0 && (
                        <ul className="mt-1 flex flex-col gap-0.5 text-xs text-(--muted-fg)">
                          {match.groups.map((group, groupIndex) => {
                            const name = Object.entries(match.named).find(([, value]) => value === group)?.[0];
                            return (
                              <li key={groupIndex}>
                                {name ?? tt(lang, "regexGroup", { n: groupIndex + 1 })}: <code>{group ?? "—"}</code>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Trailing-edge debounce for an object value (compared by content). */
function useDebounced<T>(value: T, delay: number): T {
  const [state, setState] = React.useState(value);
  const key = JSON.stringify(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setState(JSON.parse(key) as T), delay);
    return () => window.clearTimeout(timer);
  }, [key, delay]);
  return state;
}
