/**
 * The data converter operation family, extracted from the old Convert tools
 * tabs. Each operation seeds itself from the assets the workbench hands it and
 * falls back to its own file picker when rendered standalone.
 */

import * as React from "react";
import { ArrowLeftRight, Download, RefreshCw } from "lucide-react";

import {
  ActionButton,
  CopyButton,
  FilePicker,
  SelectField,
  inputClass,
  labelClass,
  panelClass,
  textareaClass,
} from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import { DATA_FORMATS, detectFormat, parseData, stringifyData, type DataFormat, type StringifyOptions } from "@/lib/convert/data";
import { bytesToBase64, bytesToHex, decodeText, DecodeError, encodeText, type EncodeMode } from "@/lib/convert/encode";
import { hashAll, type HashRow } from "@/lib/convert/hash";
import { tv } from "@/lib/convert/i18n";
import { generateUuids, inspectUuid, type UuidVersion } from "@/lib/convert/uuid";
import { formatBytesLimit, MAX_FILE_BYTES } from "@/lib/limits";
import type { OperationProps } from "@/lib/workbench/operation";
import { useSeedAssets } from "@/lib/workbench/use-seed-assets";
import { cn } from "@/lib/viewer/utils";

const FORMAT_LABEL: Record<DataFormat, string> = { json: "JSON", yaml: "YAML", toml: "TOML" };
const FORMAT_MIME: Record<DataFormat, string> = { json: "application/json", yaml: "text/yaml", toml: "application/toml" };

/** Kinds whose bytes should be encoded directly rather than read as text. */
const BINARY_KINDS = new Set(["binary", "image", "pdf", "docx", "sheet"]);

/* ------------------------------------------------------------------ data */

export function DataConvertOperation({ lang, assets }: OperationProps) {
  const [input, setInput] = React.useState("");
  const [from, setFrom] = React.useState<DataFormat | "auto">("auto");
  const [to, setTo] = React.useState<DataFormat>("yaml");
  const [indent, setIndent] = React.useState<"2" | "4" | "tab" | "0">("2");
  const [sortKeys, setSortKeys] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const deferred = React.useDeferredValue(input);
  const standalone = assets.length === 0;

  useSeedAssets(assets, async (list) => {
    if (list[0]) setInput(await list[0].text());
  });

  const result = React.useMemo(() => {
    if (deferred.trim() === "") return { kind: "empty" as const };
    const source = from === "auto" ? detectFormat(deferred) : from;
    const options: StringifyOptions = { indent: indent === "tab" ? "tab" : (Number(indent) as 0 | 2 | 4), sortKeys };
    let value: unknown;
    try {
      value = parseData(source, deferred);
    } catch (error) {
      return { kind: "error" as const, text: tv(lang, "parseError", { message: (error as Error).message }), source };
    }
    try {
      return { kind: "ok" as const, text: stringifyData(to, value, options), source };
    } catch (error) {
      return {
        kind: "error" as const,
        text: tv(lang, "writeError", { format: FORMAT_LABEL[to], message: error instanceof Error ? error.message : String(error) }),
        source,
      };
    }
  }, [deferred, from, to, indent, sortKeys, lang]);

  const output = result.kind === "ok" ? result.text : "";

  const swap = () => {
    if (result.kind !== "ok") {
      setFrom(to);
      setTo(from === "auto" ? "json" : from);
      return;
    }
    const source = result.source;
    setInput(output);
    setFrom(to);
    setTo(source);
  };

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))] lg:items-end">
        <SelectField
          label={tv(lang, "from")}
          value={from}
          onChange={(value) => setFrom(value as DataFormat | "auto")}
          options={[{ value: "auto", label: tv(lang, "auto") }, ...DATA_FORMATS.map((format) => ({ value: format, label: FORMAT_LABEL[format] }))]}
        />
        <SelectField label={tv(lang, "to")} value={to} onChange={(value) => setTo(value as DataFormat)} options={DATA_FORMATS.map((format) => ({ value: format, label: FORMAT_LABEL[format] }))} />
        <SelectField
          label={tv(lang, "indent")}
          value={indent}
          onChange={(value) => setIndent(value as typeof indent)}
          options={[
            { value: "2", label: tv(lang, "indent2") },
            { value: "4", label: tv(lang, "indent4") },
            { value: "tab", label: tv(lang, "indentTab") },
            { value: "0", label: tv(lang, "indentCompact") },
          ]}
        />
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={sortKeys} onChange={(event) => setSortKeys(event.target.checked)} />
          {tv(lang, "sortKeys")}
        </label>
        <ActionButton variant="secondary" onClick={swap}>
          <ArrowLeftRight aria-hidden="true" className="size-4" />
          {tv(lang, "swap")}
        </ActionButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label className={labelClass}>
            <span className="flex items-center justify-between gap-2">
              {tv(lang, "input")}
              {from === "auto" && result.kind !== "empty" && (
                <span className="text-xs font-normal text-(--muted-fg)">{tv(lang, "detected", { format: FORMAT_LABEL[result.source] })}</span>
              )}
            </span>
            <textarea className={cn(textareaClass, "min-h-80")} value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} placeholder={tv(lang, "pasteData")} />
          </label>
          {standalone && (
            <FilePicker
              lang={lang}
              accept=".json,.yaml,.yml,.toml,.txt,application/json"
              compact
              prompt={tv(lang, "loadFile")}
              onFiles={async ([file]) => {
                if (!file) return;
                setFileError(null);
                if (file.size > 8 * 1024 * 1024) {
                  setFileError(tv(lang, "fileTooLarge", { limit: formatBytesLimit(8 * 1024 * 1024) }));
                  return;
                }
                setInput(await file.text());
                const ext = file.name.split(".").pop()?.toLowerCase();
                if (ext === "json") setFrom("json");
                else if (ext === "yaml" || ext === "yml") setFrom("yaml");
                else if (ext === "toml") setFrom("toml");
                else setFrom("auto");
              }}
            />
          )}
          {fileError && (
            <p role="alert" className="text-sm text-(--warning)">
              {fileError}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label className={labelClass}>
            {tv(lang, "output")}
            <textarea className={cn(textareaClass, "min-h-80")} value={output} readOnly spellCheck={false} aria-invalid={result.kind === "error"} />
          </label>
          {result.kind === "error" && (
            <p role="alert" className="rounded-lg border border-(--warning)/40 bg-(--warning)/10 p-3 text-sm text-(--warning)">
              {result.text}
            </p>
          )}
          <div className="flex gap-2">
            <CopyButton lang={lang} text={output} disabled={output === ""} />
            <ActionButton
              variant="secondary"
              className="h-8 px-3 text-xs"
              disabled={output === ""}
              onClick={() => saveBlob(new Blob([output], { type: `${FORMAT_MIME[to]};charset=utf-8` }), `converted.${to === "yaml" ? "yaml" : to}`)}
            >
              <Download aria-hidden="true" className="size-3.5" />
              {tv(lang, "download")}
            </ActionButton>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- encode */

export function DataEncodeOperation({ lang, assets }: OperationProps) {
  const [mode, setMode] = React.useState<EncodeMode>("base64");
  const [direction, setDirection] = React.useState<"encode" | "decode">("encode");
  const [urlSafe, setUrlSafe] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [fileResult, setFileResult] = React.useState<{ name: string; bytes: number; text: string } | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const deferred = React.useDeferredValue(input);
  const standalone = assets.length === 0;

  useSeedAssets(assets, async (list) => {
    const first = list[0];
    if (!first) return;
    if (BINARY_KINDS.has(first.kind)) {
      const bytes = await first.bytes();
      setFileResult({ name: first.name, bytes: bytes.length, text: mode === "base64" ? bytesToBase64(bytes, urlSafe) : bytesToHex(bytes, " ") });
    } else {
      setInput(await first.text());
    }
  });

  const result = React.useMemo(() => {
    if (fileResult && direction === "encode") return { kind: "text" as const, text: fileResult.text };
    if (deferred === "") return { kind: "empty" as const };
    try {
      if (direction === "encode") return { kind: "text" as const, text: encodeText(mode, deferred, { urlSafe }) };
      const decoded = decodeText(mode, deferred);
      return decoded.kind === "text" ? { kind: "text" as const, text: decoded.text } : { kind: "binary" as const, bytes: decoded.bytes };
    } catch (error) {
      return { kind: "error" as const, text: error instanceof DecodeError ? error.message : String(error) };
    }
  }, [deferred, mode, direction, urlSafe, fileResult]);

  const output = result.kind === "text" ? result.text : "";
  const fileCapable = direction === "encode" && (mode === "base64" || mode === "hex");

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <SelectField
          label={tv(lang, "mode")}
          value={mode}
          onChange={(value) => {
            setMode(value as EncodeMode);
            setFileResult(null);
          }}
          options={[
            { value: "base64", label: tv(lang, "modeBase64") },
            { value: "urlComponent", label: tv(lang, "modeUrlComponent") },
            { value: "url", label: tv(lang, "modeUrl") },
            { value: "hex", label: tv(lang, "modeHex") },
          ]}
        />
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{tv(lang, "direction")}</legend>
          <div className="flex gap-1.5">
            {(["encode", "decode"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={direction === value}
                onClick={() => setDirection(value)}
                className={cn(
                  "h-9 flex-1 rounded-md border px-3 text-sm transition-colors",
                  direction === value ? "border-(--accent) bg-(--accent)/10 font-medium text-(--accent)" : "border-(--border) bg-(--bg) hover:bg-(--surface)",
                )}
              >
                {tv(lang, value)}
              </button>
            ))}
          </div>
        </fieldset>
        {mode === "base64" && direction === "encode" && (
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={urlSafe} onChange={(event) => setUrlSafe(event.target.checked)} />
            {tv(lang, "urlSafe")}
          </label>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label className={labelClass}>
            {tv(lang, "textInput")}
            <textarea
              className={cn(textareaClass, "min-h-56")}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setFileResult(null);
              }}
              spellCheck={false}
            />
          </label>
          {standalone && fileCapable && (
            <FilePicker
              lang={lang}
              accept="*/*"
              compact
              prompt={tv(lang, "encodeFile")}
              onFiles={async ([file]) => {
                if (!file) return;
                setFileError(null);
                if (file.size > MAX_FILE_BYTES) {
                  setFileError(tv(lang, "fileTooLarge", { limit: formatBytesLimit(MAX_FILE_BYTES) }));
                  return;
                }
                const bytes = new Uint8Array(await file.arrayBuffer());
                setFileResult({ name: file.name, bytes: bytes.length, text: mode === "base64" ? bytesToBase64(bytes, urlSafe) : bytesToHex(bytes, " ") });
              }}
            />
          )}
          {fileError && (
            <p role="alert" className="text-sm text-(--warning)">
              {fileError}
            </p>
          )}
          {fileResult && direction === "encode" && (
            <p className="text-sm text-(--muted-fg)">{tv(lang, "fileEncoded", { name: fileResult.name, bytes: fileResult.bytes })}</p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label className={labelClass}>
            {tv(lang, "output")}
            <textarea className={cn(textareaClass, "min-h-56")} value={output} readOnly spellCheck={false} aria-invalid={result.kind === "error"} />
          </label>
          {result.kind === "error" && (
            <p role="alert" className="rounded-lg border border-(--warning)/40 bg-(--warning)/10 p-3 text-sm text-(--warning)">
              {tv(lang, "decodeError", { message: result.text })}
            </p>
          )}
          {result.kind === "binary" && (
            <div className="flex flex-col gap-2 rounded-lg border border-(--border) bg-(--surface) p-3 text-sm">
              <p>{tv(lang, "binaryResult", { bytes: result.bytes.length })}</p>
              <ActionButton
                variant="secondary"
                className="h-8 self-start px-3 text-xs"
                onClick={() => saveBlob(new Blob([result.bytes as unknown as BlobPart], { type: "application/octet-stream" }), "decoded.bin")}
              >
                <Download aria-hidden="true" className="size-3.5" />
                {tv(lang, "downloadBinary")}
              </ActionButton>
            </div>
          )}
          <CopyButton lang={lang} text={output} disabled={output === ""} className="self-start" />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ hash */

export function DataHashOperation({ lang, assets }: OperationProps) {
  const [source, setSource] = React.useState<"text" | "file">("text");
  const [text, setText] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [file, setFile] = React.useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<HashRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [upper, setUpper] = React.useState(false);
  const [compare, setCompare] = React.useState("");
  const deferredText = React.useDeferredValue(text);
  const standalone = assets.length === 0;

  useSeedAssets(assets, async (list) => {
    const first = list[0];
    if (!first) return;
    setSource("file");
    setFile({ name: first.name, bytes: await first.bytes() });
  });

  React.useEffect(() => {
    const data = source === "text" ? new TextEncoder().encode(deferredText) : file?.bytes;
    if (!data || (source === "text" && deferredText === "")) {
      setRows([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    hashAll(data, secret || undefined)
      .then((result) => {
        if (cancelled) return;
        setRows(result);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, deferredText, file, secret]);

  const shown = rows.map((row) => ({ ...row, hex: upper ? row.hex.toUpperCase() : row.hex }));
  const wanted = compare.trim().toLowerCase().replace(/\s+/g, "");
  const matched = wanted ? rows.find((row) => row.hex === wanted) : undefined;

  return (
    <>
      {standalone && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{tv(lang, "hashSource")}</legend>
          <div className="flex gap-1.5">
            {(["text", "file"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={source === value}
                onClick={() => setSource(value)}
                className={cn(
                  "h-9 rounded-md border px-4 text-sm transition-colors",
                  source === value ? "border-(--accent) bg-(--accent)/10 font-medium text-(--accent)" : "border-(--border) bg-(--bg) hover:bg-(--surface)",
                )}
              >
                {tv(lang, value === "text" ? "hashText" : "hashFile")}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          {source === "text" ? (
            <label className={labelClass}>
              {tv(lang, "hashTextInput")}
              <textarea className={cn(textareaClass, "min-h-40")} value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
            </label>
          ) : (
            <>
              {standalone && (
                <FilePicker
                  lang={lang}
                  accept="*/*"
                  onFiles={async ([picked]) => {
                    if (!picked) return;
                    setFileError(null);
                    if (picked.size > MAX_FILE_BYTES) {
                      setFileError(tv(lang, "fileTooLarge", { limit: formatBytesLimit(MAX_FILE_BYTES) }));
                      return;
                    }
                    setFile({ name: picked.name, bytes: new Uint8Array(await picked.arrayBuffer()) });
                  }}
                />
              )}
              {fileError && (
                <p role="alert" className="text-sm text-(--warning)">
                  {fileError}
                </p>
              )}
              {file && <p className="text-sm text-(--muted-fg)">{tv(lang, "hashFileName", { name: file.name, bytes: file.bytes.length })}</p>}
            </>
          )}
          <label className={labelClass}>
            {tv(lang, "secret")}
            <input className={cn(inputClass, "font-mono")} value={secret} onChange={(event) => setSecret(event.target.value)} spellCheck={false} autoComplete="off" aria-describedby="hash-secret-hint" />
            <span id="hash-secret-hint" className="text-xs font-normal text-(--muted-fg)">
              {tv(lang, "secretHint")}
            </span>
          </label>
        </div>

        <div className="flex min-w-0 flex-col gap-3" aria-live="polite" aria-busy={busy}>
          {error && (
            <p role="alert" className="rounded-lg border border-(--warning)/40 bg-(--warning)/10 p-3 text-sm text-(--warning)">
              {error}
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={upper} onChange={(event) => setUpper(event.target.checked)} />
            {tv(lang, "uppercase")}
          </label>
          <ul className="flex flex-col gap-2">
            {shown.map((row) => (
              <li key={row.algorithm} className={cn(panelClass, "flex flex-col gap-1.5", matched?.algorithm === row.algorithm && "border-(--success)")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-(--muted-fg)">{secret ? `HMAC-${row.algorithm}` : row.algorithm}</span>
                  <CopyButton lang={lang} text={row.hex} />
                </div>
                <code className="break-all font-mono text-sm">{row.hex}</code>
              </li>
            ))}
          </ul>
          {rows.length > 0 && (
            <>
              <label className={labelClass}>
                {tv(lang, "compareWith")}
                <input className={cn(inputClass, "font-mono")} value={compare} onChange={(event) => setCompare(event.target.value)} spellCheck={false} autoComplete="off" />
              </label>
              {wanted && (
                <p role="status" className={cn("text-sm font-medium", matched ? "text-(--success)" : "text-(--warning)")}>
                  {matched ? `✓ ${tv(lang, "compareMatch", { algorithm: secret ? `HMAC-${matched.algorithm}` : matched.algorithm })}` : `✗ ${tv(lang, "compareNone")}`}
                </p>
              )}
              <p className="text-xs text-(--muted-fg)">{tv(lang, "md5Note")}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ uuid */

export function DataUuidOperation({ lang }: OperationProps) {
  const [version, setVersion] = React.useState<UuidVersion>("v4");
  const [count, setCount] = React.useState(5);
  const [uppercase, setUppercase] = React.useState(false);
  const [hyphens, setHyphens] = React.useState(true);
  const [braces, setBraces] = React.useState(false);
  const [list, setList] = React.useState<string[]>([]);
  const [probe, setProbe] = React.useState("");

  const generate = React.useCallback(() => setList(generateUuids({ version, count, uppercase, hyphens, braces })), [version, count, uppercase, hyphens, braces]);

  // Random values must not be part of the server render, so generate after mount
  // and whenever an option changes.
  React.useEffect(generate, [generate]);

  const info = React.useMemo(() => (probe.trim() === "" ? null : inspectUuid(probe)), [probe]);
  const text = list.join("\n");

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(6,minmax(0,1fr))] lg:items-end">
        <SelectField
          label={tv(lang, "version")}
          value={version}
          onChange={(value) => setVersion(value as UuidVersion)}
          options={[
            { value: "v4", label: tv(lang, "v4") },
            { value: "v7", label: tv(lang, "v7") },
            { value: "nil", label: tv(lang, "nil") },
          ]}
        />
        <label className={labelClass}>
          {tv(lang, "count")}
          <input
            type="number"
            min={1}
            max={500}
            className={inputClass}
            value={count}
            onChange={(event) => setCount(Math.min(500, Math.max(1, Number(event.target.value) || 1)))}
          />
        </label>
        {(
          [
            ["uppercase", uppercase, setUppercase],
            ["hyphens", hyphens, setHyphens],
            ["braces", braces, setBraces],
          ] as const
        ).map(([key, value, set]) => (
          <label key={key} className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={value} onChange={(event) => set(event.target.checked)} />
            {tv(lang, key)}
          </label>
        ))}
        <ActionButton onClick={generate}>
          <RefreshCw aria-hidden="true" className="size-4" />
          {tv(lang, "generate")}
        </ActionButton>
      </div>

      <div className="flex flex-col gap-2">
        <label className={labelClass}>
          {tv(lang, "uuids")}
          <textarea className={cn(textareaClass, "min-h-44")} value={text} readOnly spellCheck={false} />
        </label>
        <CopyButton lang={lang} text={text} label={tv(lang, "copyAll")} disabled={text === ""} className="self-start" />
      </div>

      <section className={cn(panelClass, "flex flex-col gap-2")} aria-labelledby="uuid-inspect">
        <h2 id="uuid-inspect" className="text-sm font-semibold">
          {tv(lang, "inspect")}
        </h2>
        <label className={labelClass}>
          <span className="sr-only">{tv(lang, "inspectInput")}</span>
          <input className={cn(inputClass, "font-mono")} value={probe} onChange={(event) => setProbe(event.target.value)} placeholder="018f…" spellCheck={false} autoComplete="off" aria-label={tv(lang, "inspectInput")} />
        </label>
        <div role="status" className="text-sm">
          {info && !info.valid && <span className="text-(--warning)">{tv(lang, "inspectInvalid")}</span>}
          {info?.valid && (
            <>
              <p>{tv(lang, "inspectVersion", { version: info.version, variant: info.variant })}</p>
              {info.timestamp && <p className="text-(--muted-fg)">{tv(lang, "inspectTime", { time: info.timestamp.toISOString() })}</p>}
            </>
          )}
        </div>
      </section>
    </>
  );
}
