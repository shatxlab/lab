/** The page as it was read, with the doubtful words boxed, so a person knows where to look first. */

import * as React from "react";

import type { AppLang } from "@/lib/apps/lang";
import { DOUBTFUL, VERY_DOUBTFUL, doubtfulWords } from "@/lib/ocr/layout";
import { toc } from "@/lib/ocr/i18n";
import type { PageResult } from "@/lib/ocr/run";
import { cn } from "@/lib/viewer/utils";

const MAX_LISTED = 40;

export function OcrWords({ lang, details }: { lang: AppLang; details: readonly PageResult[] }) {
  const [at, setAt] = React.useState(0);
  const [boxes, setBoxes] = React.useState(true);
  const page = details[Math.min(at, details.length - 1)];
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!page?.image || typeof URL.createObjectURL !== "function") return setUrl(null);
    const made = URL.createObjectURL(page.image);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [page]);

  if (!page) return null;
  const doubtful = doubtfulWords(page.words);
  const total = details.reduce((sum, item) => sum + doubtfulWords(item.words).length, 0);
  const listed = [...new Set(doubtful.map((word) => word.text))].slice(0, MAX_LISTED);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="ocr-doubtful">
      <h3 id="ocr-doubtful" className="text-sm font-semibold">
        {toc(lang, "doubtful")}
      </h3>
      <p className="text-sm" role="status">
        {total === 0 ? toc(lang, "doubtfulNone") : toc(lang, "doubtfulCount", { n: total })}
      </p>

      {details.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          {toc(lang, "pageLabel")}
          <select className="rounded-md border border-(--border) bg-(--bg) px-2 py-1" value={at} onChange={(event) => setAt(Number(event.target.value))}>
            {details.map((item, i) => (
              <option key={item.number} value={i}>
                {item.number}
              </option>
            ))}
          </select>
        </label>
      )}

      {listed.length > 0 && (
        <p className="text-sm break-words">
          <span className="font-medium">{toc(lang, "doubtfulList")}</span> {listed.join(", ")}
          {doubtful.length > listed.length ? " …" : ""}
        </p>
      )}

      {url && (
        <>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={boxes} onChange={(event) => setBoxes(event.target.checked)} />
            {toc(lang, "showDoubtful")}
          </label>
          <div className="relative w-full overflow-auto rounded-lg border border-(--border) bg-white">
            <div className="relative" style={{ aspectRatio: `${page.width} / ${page.height}` }}>
              <img src={url} alt={toc(lang, "pageAlt", { n: page.number })} className="absolute inset-0 size-full object-contain" />
              {boxes && (
                <svg viewBox={`0 0 ${page.width} ${page.height}`} className={cn("pointer-events-none absolute inset-0 size-full")} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
                  {doubtful.map((word, i) => {
                    const very = word.confidence < VERY_DOUBTFUL;
                    return (
                      <rect
                        key={i}
                        x={word.bbox.x0 - 2}
                        y={word.bbox.y0 - 2}
                        width={word.bbox.x1 - word.bbox.x0 + 4}
                        height={word.bbox.y1 - word.bbox.y0 + 4}
                        fill={very ? "#d8453a" : "#e0a100"}
                        fillOpacity={0.22}
                        stroke={very ? "#d8453a" : "#c58a00"}
                        strokeWidth={Math.max(2, page.width / 400)}
                        rx={3}
                      />
                    );
                  })}
                </svg>
              )}
            </div>
          </div>
          <p className="text-xs text-(--muted-fg)">{toc(lang, "doubtfulLegend", { low: DOUBTFUL, high: VERY_DOUBTFUL })}</p>
        </>
      )}
    </section>
  );
}
