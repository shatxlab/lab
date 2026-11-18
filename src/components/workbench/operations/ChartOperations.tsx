/**
 * `chart.make` — turn a spreadsheet into a chart: line, bars (grouped when there
 * are several series), histogram or scatter, picked from the shape of the data and
 * adjustable by hand. The SVG shown is the SVG exported (and, as a PNG, drawn
 * from it); either is downloaded when asked for.
 */

import * as React from "react";

import { ChartView } from "@/components/charts/ChartView";
import { ActionButton, SelectField, inputClass, labelClass, panelClass } from "@/components/tools/ui";
import { useDark } from "@/lib/apps/use-dark";
import { buildChart, type ChartText, type Scene } from "@/lib/charts/build";
import { tableFromRows, type Table } from "@/lib/charts/data";
import { fileKey, readChartMemory, rememberOpenSheet, rememberSheet, type SheetMemory } from "@/lib/charts/memory";
import { exportName, svgBytes, svgToPng } from "@/lib/charts/export";
import { tch } from "@/lib/charts/i18n";
import { paletteFor } from "@/lib/charts/palette";
import { prepare, type Prepared } from "@/lib/charts/prepare";
import {
  MAX_CATEGORIES,
  MAX_SCATTER_SERIES,
  MAX_SERIES,
  SLOT_COUNT,
  availableTypes,
  normalizeSpec,
  numericColumns,
  plottableColumns,
  slotOf,
  splitCandidates,
  suggestSpec,
  type Aggregate,
  type ChartSpec,
  type ChartType,
} from "@/lib/charts/spec";
import type { AppLang } from "@/lib/apps/lang";
import type { SheetData } from "@/lib/viewer/sheet";
import { cn } from "@/lib/viewer/utils";
import type { OperationProps } from "@/lib/workbench/operation";

type Loaded = { status: "loading" } | { status: "error" } | { status: "ready"; sheets: SheetData[] };

/** The four buttons: Bars covers grouped bars too, since several series make them grouped. */
const TYPE_BUTTONS: { type: ChartType; key: "typeLine" | "typeBar" | "typeHistogram" | "typeScatter"; covers: ChartType[] }[] = [
  { type: "line", key: "typeLine", covers: ["line"] },
  { type: "bar", key: "typeBar", covers: ["bar", "grouped"] },
  { type: "histogram", key: "typeHistogram", covers: ["histogram"] },
  { type: "scatter", key: "typeScatter", covers: ["scatter"] },
];

function autoTitle(lang: AppLang, prepared: Prepared, spec: ChartSpec, table: Table): string {
  const names = (list: { name: string }[]) => (list.length > 3 ? `${list[0]!.name}, ${list[1]!.name} +${list.length - 2}` : list.map((s) => s.name).join(", "));
  switch (prepared.type) {
    case "histogram":
      return tch(lang, "titleHistogram", { y: prepared.name });
    case "scatter":
      return tch(lang, "titleScatter", { y: names(prepared.series), x: prepared.xName });
    case "bar":
    case "line": {
      if (spec.splitBy !== null && (prepared.type === "bar" || prepared.type === "line")) {
        const measure = spec.y.length > 0 ? table.columns[spec.y[0]!]!.name : tch(lang, "rows");
        return tch(lang, "titleSplit", { y: measure, x: prepared.xName, split: table.columns[spec.splitBy]!.name });
      }
      return prepared.type === "bar" && spec.y.length === 0
        ? tch(lang, "titleCount", { x: prepared.xName })
        : tch(lang, "titleBy", { y: names(prepared.series), x: prepared.xName });
    }
  }
}

function chartText(lang: AppLang, title: string): ChartText {
  return {
    title,
    frequency: tch(lang, "frequency"),
    noValue: tch(lang, "noValue"),
    total: tch(lang, "total"),
    points: (n) => tch(lang, "points", { n }),
  };
}

export function ChartOperation({ lang, assets, params, setParams, onProduce }: OperationProps) {
  const asset = assets[0];
  const [loaded, setLoaded] = React.useState<Loaded>({ status: "loading" });
  const [sheetIndex, setSheetIndex] = React.useState(0);
  const [header, setHeader] = React.useState<boolean | null>(null);
  const file = asset ? fileKey(asset.name, asset.size) : "";

  React.useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    setLoaded({ status: "loading" });
    setSheetIndex(0);
    setHeader(null);
    asset
      .workbook()
      .then((book) => {
        if (cancelled) return;
        // Reopening a file brings back the sheet that was open and its header choice.
        const remembered = readChartMemory()[fileKey(asset.name, asset.size)];
        const at = Math.max(0, book.sheets.findIndex((item) => item.name === remembered?.sheet));
        setSheetIndex(at);
        setHeader(remembered?.sheets[book.sheets[at]?.name ?? ""]?.header ?? null);
        setLoaded({ status: "ready", sheets: book.sheets });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [asset]);

  if (!asset) return null;
  if (loaded.status === "loading") return <p className="text-sm text-(--muted-fg)">{tch(lang, "loading")}</p>;
  if (loaded.status === "error") return <p className="text-sm text-(--warning)" role="alert">{tch(lang, "loadFailed")}</p>;
  if (loaded.sheets.length === 0) return <p className="text-sm text-(--muted-fg)">{tch(lang, "noSheets")}</p>;

  const sheet = loaded.sheets[Math.min(sheetIndex, loaded.sheets.length - 1)]!;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        {loaded.sheets.length > 1 && (
          <SelectField
            label={tch(lang, "sheet")}
            value={String(sheetIndex)}
            onChange={(value) => {
              const next = loaded.sheets[Number(value)];
              if (next) rememberOpenSheet(file, next.name);
              setSheetIndex(Number(value));
              setHeader(next ? (readChartMemory()[file]?.sheets[next.name]?.header ?? null) : null);
            }}
            options={loaded.sheets.map((item, i) => ({ value: String(i), label: item.name }))}
            className="min-w-40"
          />
        )}
        <HeaderToggle
          lang={lang}
          sheet={sheet}
          header={header}
          onChange={(value) => {
            // Columns move when the header does, so the old column choices no longer apply.
            rememberSheet(file, sheet.name, { spec: {}, title: readChartMemory()[file]?.sheets[sheet.name]?.title ?? "", header: value });
            setHeader(value);
          }}
        />
      </div>
      <Workspace
        key={`${asset.id}|${sheetIndex}|${header}`}
        lang={lang}
        file={file}
        sourceName={asset.name}
        sheet={sheet}
        header={header}
        params={params}
        setParams={setParams}
        onProduce={onProduce}
      />
    </div>
  );
}

/** "First row is a header", showing what auto-detection decided until the user overrides it. */
function HeaderToggle({ lang, sheet, header, onChange }: { lang: AppLang; sheet: SheetData; header: boolean | null; onChange: (value: boolean | null) => void }) {
  const detected = React.useMemo(() => tableFromRows(sheet.name, sheet.rows, { dayFirst: lang === "ru" }).header, [sheet, lang]);
  return (
    <label className="flex items-center gap-2 pb-2 text-sm font-medium">
      <input type="checkbox" checked={header ?? detected} onChange={(event) => onChange(event.target.checked === detected ? null : event.target.checked)} />
      {tch(lang, "firstRowHeader")}
    </label>
  );
}

interface WorkspaceProps {
  lang: AppLang;
  /** Key the settings are remembered under (file name and size). */
  file: string;
  sourceName: string;
  sheet: SheetData;
  header: boolean | null;
  params: OperationProps["params"];
  setParams: OperationProps["setParams"];
  onProduce: OperationProps["onProduce"];
}

function Workspace({ lang, file, sourceName, sheet, header, params, setParams, onProduce }: WorkspaceProps) {
  const dark = useDark();
  const uid = `ch${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const table = React.useMemo(() => tableFromRows(sheet.name, sheet.rows, { header: header ?? undefined, dayFirst: lang === "ru" }), [sheet, header, lang]);
  const suggestion = React.useMemo(() => suggestSpec(table), [table]);
  // What this file's chart looked like last time, if it was made before.
  const [saved] = React.useState<SheetMemory | undefined>(() => readChartMemory()[file]?.sheets[sheet.name]);
  const [override, setOverride] = React.useState<Partial<ChartSpec>>(() => saved?.spec ?? {});
  const [title, setTitle] = React.useState(() => saved?.title ?? "");
  const touched = React.useRef(false);
  React.useEffect(() => {
    // Nothing is written until the user changes something, so merely looking leaves no trace.
    if (!touched.current) {
      touched.current = true;
      return;
    }
    rememberSheet(file, sheet.name, { spec: override, title, header });
  }, [file, sheet.name, override, title, header]);
  const [showTable, setShowTable] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // The chart is drawn at the width it is shown at, so its text stays readable on a phone.
  const frameRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState<number | undefined>(undefined);
  React.useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const w = Math.round(frame.clientWidth / 10) * 10;
      setWidth(w >= 240 ? Math.min(w, 960) : undefined);
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const patterns = params?.patterns === true;
  const exportDark = params?.exportDark === true;

  const spec = React.useMemo(() => (suggestion ? normalizeSpec(table, { ...suggestion, ...override }) : null), [table, suggestion, override]);
  const prepared = React.useMemo(() => (spec ? prepare(table, spec, tch(lang, "rows")) : null), [table, spec, lang]);
  const resolvedTitle = prepared && spec ? title.trim() || autoTitle(lang, prepared, spec, table) : "";

  const build = React.useCallback(
    (dark: boolean, id: string, at?: number): Scene | null =>
      prepared && spec ? buildChart(prepared, { palette: paletteFor(dark), lang, text: chartText(lang, resolvedTitle), patterns, area: spec.area, uid: id, width: at }) : null,
    [prepared, spec, lang, resolvedTitle, patterns],
  );
  const scene = React.useMemo(() => build(dark, uid, width), [build, dark, uid, width]);

  if (!spec || !prepared || !scene) return <p className="text-sm text-(--muted-fg)">{tch(lang, "noData")}</p>;

  const types = availableTypes(table);
  const numeric = plottableColumns(table);
  const set = (patch: Partial<ChartSpec>) => setOverride((current) => ({ ...current, ...patch }));
  const isBars = spec.type === "bar" || spec.type === "grouped";
  const cap = spec.type === "scatter" ? MAX_SCATTER_SERIES : MAX_SERIES;
  const palette = paletteFor(dark);

  const splitting = spec.splitBy !== null;
  const splits = spec.type === "line" || isBars ? splitCandidates(table, spec.x) : [];
  const toggleSeries = (position: number, on: boolean) => {
    if (spec.type === "histogram" || splitting) return set({ y: [position], ...(isBars && spec.aggregate === "count" ? { aggregate: "sum" as Aggregate } : {}) });
    const next = on ? [...spec.y, position] : spec.y.filter((p) => p !== position);
    set({ y: next.sort((a, b) => a - b), ...(isBars && next.length > 0 && spec.aggregate === "count" ? { aggregate: "sum" as Aggregate } : {}) });
  };

  const notes: string[] = [];
  if (sheet.truncated || table.truncated) notes.push(tch(lang, "truncatedRows", { n: table.rowCount.toLocaleString(lang) }));
  if (prepared.type === "bar" && prepared.omitted > 0) notes.push(tch(lang, "omittedCategories", { n: prepared.omitted, max: MAX_CATEGORIES }));
  if ((prepared.type === "bar" || prepared.type === "line") && prepared.omittedSeries > 0) notes.push(tch(lang, "omittedSeries", { n: prepared.omittedSeries, max: MAX_SERIES }));
  if (prepared.type === "line" && prepared.thinned > 0) notes.push(tch(lang, "thinnedPoints", { n: prepared.thinned }));

  const exportAs = async (kind: "svg" | "png") => {
    const exported = build(exportDark, "ex");
    if (!exported) return;
    setFailed(false);
    if (kind === "svg") {
      onProduce?.({ name: exportName(sourceName, "svg"), type: "image/svg+xml", bytes: svgBytes(exported), kind: "image" });
      return;
    }
    setBusy(true);
    try {
      onProduce?.({ name: exportName(sourceName, "png"), type: "image/png", bytes: await svgToPng(exported), kind: "image" });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const xOptions = (spec.type === "scatter" ? numeric : table.columns.map((_, i) => i)).map((position) => ({ value: String(position), label: table.columns[position]!.name }));

  return (
    <>
      <div ref={frameRef}>
        <ChartView scene={scene} palette={palette} label={scene.description} help={tch(lang, "chartHelp")} />
      </div>
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-(--muted-fg)">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <section className={cn(panelClass, "flex flex-col gap-4")} aria-labelledby="chart-settings">
        <h2 id="chart-settings" className="text-sm font-semibold">
          {tch(lang, "settings")}
        </h2>

        <div role="group" aria-label={tch(lang, "chartType")} className="flex flex-wrap gap-2">
          {TYPE_BUTTONS.filter((button) => button.covers.some((type) => types.includes(type))).map((button) => {
            const on = button.covers.includes(spec.type);
            return (
              <ActionButton key={button.type} variant={on ? "primary" : "secondary"} aria-pressed={on} onClick={() => set({ type: button.type })}>
                {button.type === "bar" && spec.type === "grouped" ? tch(lang, "typeGrouped") : tch(lang, button.key)}
              </ActionButton>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {spec.type !== "histogram" && (
            <SelectField
              label={tch(lang, "xColumn")}
              value={String(spec.x ?? "")}
              onChange={(value) => set({ x: Number(value) })}
              options={xOptions}
            />
          )}

          <fieldset className="flex min-w-0 flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">{tch(lang, "yColumns")}</legend>
            {numeric.map((position) => {
              const checked = spec.y.includes(position);
              const slot = slotOf(table, position)!;
              const single = spec.type === "histogram" || splitting;
              const locked = single ? false : !checked && spec.y.length >= cap;
              const lastOne = checked && spec.y.length === 1 && !isBars && !single;
              return (
                <label key={position} className="flex items-center gap-2 text-sm">
                  <input
                    type={spec.type === "histogram" || splitting ? "radio" : "checkbox"}
                    name="chart-y"
                    checked={checked}
                    disabled={locked || lastOne}
                    onChange={(event) => toggleSeries(position, event.target.checked)}
                  />
                  <span aria-hidden="true" className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: palette.series[slot] }} />
                  <span className="truncate">{table.columns[position]!.name}</span>
                </label>
              );
            })}
            {spec.type !== "histogram" && !splitting && <p className="text-xs text-(--muted-fg)">{tch(lang, "seriesLimit", { n: cap })}</p>}
            {numericColumns(table).length > SLOT_COUNT && <p className="text-xs text-(--muted-fg)">{tch(lang, "tooManyColumns", { n: SLOT_COUNT })}</p>}
          </fieldset>
        </div>

        {splits.length > 0 && (
          <div className="flex flex-col gap-1">
            <SelectField
              label={tch(lang, "splitBy")}
              value={spec.splitBy === null ? "" : String(spec.splitBy)}
              onChange={(value) => set({ splitBy: value === "" ? null : Number(value), ...(value === "" ? {} : { y: spec.y.slice(0, 1) }) })}
              options={[{ value: "", label: tch(lang, "splitNone") }, ...splits.map((position) => ({ value: String(position), label: table.columns[position]!.name }))]}
            />
            <p className="text-xs text-(--muted-fg)">{tch(lang, "splitHint")}</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {isBars && (
            <>
              <SelectField
                label={tch(lang, "aggregate")}
                value={spec.aggregate}
                onChange={(value) => (value === "count" ? set({ aggregate: "count", y: [] }) : set({ aggregate: value as Aggregate }))}
                options={[
                  { value: "none", label: tch(lang, "aggNone") },
                  { value: "sum", label: tch(lang, "aggSum") },
                  { value: "mean", label: tch(lang, "aggMean") },
                  { value: "count", label: tch(lang, "aggCount") },
                ]}
              />
              <SelectField
                label={tch(lang, "orientation")}
                value={spec.horizontal === null ? "auto" : spec.horizontal ? "horizontal" : "vertical"}
                onChange={(value) => set({ horizontal: value === "auto" ? null : value === "horizontal" })}
                options={[
                  { value: "auto", label: tch(lang, "orientAuto") },
                  { value: "vertical", label: tch(lang, "orientVertical") },
                  { value: "horizontal", label: tch(lang, "orientHorizontal") },
                ]}
              />
            </>
          )}
          {isBars && (spec.y.length > 1 || splitting) && (
            <label className="flex flex-col gap-0.5 self-end pb-2 text-sm font-medium">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={spec.stacked} onChange={(event) => set({ stacked: event.target.checked })} />
                {tch(lang, "stacked")}
              </span>
              <span className="pl-6 text-xs font-normal text-(--muted-fg)">{tch(lang, "stackedHint")}</span>
            </label>
          )}
          {spec.type === "histogram" && (
            <label className={labelClass}>
              {tch(lang, "bins")}
              <input
                type="number"
                min={3}
                max={60}
                className={inputClass}
                placeholder={tch(lang, "binsAuto")}
                value={spec.bins ?? ""}
                onChange={(event) => set({ bins: event.target.value === "" ? null : Number(event.target.value) })}
              />
            </label>
          )}
          {spec.type === "line" && (
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
              <input type="checkbox" checked={spec.area} onChange={(event) => set({ area: event.target.checked })} />
              {tch(lang, "area")}
            </label>
          )}
          <label className={labelClass}>
            {tch(lang, "title")}
            <input className={inputClass} value={title} maxLength={120} placeholder={tch(lang, "titlePlaceholder")} onChange={(event) => setTitle(event.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <ActionButton
            variant="secondary"
            className="h-8 px-3 text-xs"
            disabled={Object.keys(override).length === 0 && title === ""}
            onClick={() => {
              setOverride({});
              setTitle("");
            }}
          >
            {tch(lang, "reset")}
          </ActionButton>
          <span className="text-xs text-(--muted-fg)">{tch(lang, "remembered")}</span>
        </div>

        <label className="flex flex-col gap-0.5 text-sm font-medium">
          <span className="flex items-center gap-2">
            <input type="checkbox" checked={patterns} onChange={(event) => setParams?.({ patterns: event.target.checked })} />
            {tch(lang, "patterns")}
          </span>
          <span className="pl-6 text-xs font-normal text-(--muted-fg)">{tch(lang, "patternsHint")}</span>
        </label>
      </section>

      <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="chart-export">
        <h2 id="chart-export" className="text-sm font-semibold">
          {tch(lang, "exportTitle")}
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={tch(lang, "exportBackground")}
            value={exportDark ? "dark" : "light"}
            onChange={(value) => setParams?.({ exportDark: value === "dark" })}
            options={[
              { value: "light", label: tch(lang, "backgroundLight") },
              { value: "dark", label: tch(lang, "backgroundDark") },
            ]}
            className="min-w-36"
          />
          <ActionButton onClick={() => void exportAs("svg")} disabled={busy}>
            {tch(lang, "addSvg")}
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => void exportAs("png")} disabled={busy}>
            {busy ? tch(lang, "exporting") : tch(lang, "addPng")}
          </ActionButton>
        </div>
        {failed && (
          <p className="text-sm text-(--warning)" role="alert">
            {tch(lang, "exportFailed")}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <div>
          <ActionButton variant="secondary" aria-expanded={showTable} onClick={() => setShowTable((on) => !on)}>
            {showTable ? tch(lang, "hideTable") : tch(lang, "showTable")}
          </ActionButton>
        </div>
        {showTable && <DataTable lang={lang} scene={scene} />}
      </div>
    </>
  );
}

const TABLE_ROWS = 500;

function DataTable({ lang, scene }: { lang: AppLang; scene: Scene }) {
  const rows = scene.table.rows.slice(0, TABLE_ROWS);
  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-96 overflow-auto rounded-lg border border-(--border)">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{tch(lang, "tableCaption")}</caption>
          <thead className="sticky top-0 bg-(--surface)">
            <tr>
              {scene.table.headers.map((header, i) => (
                <th key={i} scope="col" className="border-b border-(--border) px-3 py-2 text-left font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="odd:bg-(--bg)">
                {row.map((cell, c) => (
                  <td key={c} className={cn("px-3 py-1.5", c > 0 && "tabular-nums")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scene.table.rows.length > TABLE_ROWS && <p className="text-xs text-(--muted-fg)">{tch(lang, "tableShowing", { n: TABLE_ROWS, total: scene.table.rows.length })}</p>}
    </div>
  );
}
