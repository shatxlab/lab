import * as React from "react";
import { Download, FileText, Printer, Upload } from "lucide-react";

import { CvDocument } from "@/components/cv/CvDocument";
import { CvEditor } from "@/components/cv/CvEditor";
import { ImportText } from "@/components/cv/ImportText";
import { ActionButton, SelectField, Tabs, ToolPage, inputClass, panelClass } from "@/components/tools/ui";
import { saveBlob } from "@/lib/apps/file-open";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { cvFileName, cvToDocx, cvToJson, cvToText, titleOf } from "@/lib/cv/export";
import { tcv } from "@/lib/cv/i18n";
import { LIMITS, createCv, exampleCv, newId, type Cv, type CvLang } from "@/lib/cv/schema";
import { cleanCv, parseCvFile, readCvStore, writeCvStore, type CvStore } from "@/lib/cv/storage";
import { printDocument } from "@/lib/viewer/print";
import { cn } from "@/lib/viewer/utils";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** A sheet's width in CSS pixels, for scaling the preview to its box. */
const SHEET_PX = { a4: 794, letter: 816 } as const;

type View = "edit" | "preview";

/** The page, scaled down (never up) to fit the width it is shown in. */
function PreviewFrame({ cv }: { cv: Cv }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(1);
  React.useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const measure = () => setZoom(box.clientWidth > 0 ? Math.min(1, box.clientWidth / SHEET_PX[cv.settings.paper]) : 1);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [cv.settings.paper]);
  return (
    <div ref={ref} className="overflow-hidden rounded-xl border border-(--border) bg-neutral-200 p-0 dark:bg-neutral-800" data-no-print="">
      <div style={{ zoom }} className="shadow-lg">
        <CvDocument cv={cv} />
      </div>
    </div>
  );
}

export default function CvApp() {
  const lang = useAppLang();
  const [store, setStore] = React.useState<CvStore>({ cvs: [], current: null });
  const storeRef = React.useRef(store);
  const [hydrated, setHydrated] = React.useState(false);
  const [view, setView] = React.useState<View>("edit");
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const commit = React.useCallback((update: (current: CvStore) => CvStore) => {
    const next = update(storeRef.current);
    if (next === storeRef.current) return;
    storeRef.current = next;
    setStore(next);
    writeCvStore(next);
  }, []);

  React.useEffect(() => {
    let loaded = readCvStore();
    if (loaded.cvs.length === 0) {
      const first = createCv(tcv(lang, "defaultName", { n: 1 }), lang as CvLang);
      loaded = { cvs: [first], current: first.id };
    }
    storeRef.current = loaded;
    setStore(loaded);
    setHydrated(true);
    // Only the first render decides the new CV's language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cv = store.cvs.find((item) => item.id === store.current) ?? store.cvs[0];

  const edit = React.useCallback(
    (update: (cv: Cv) => Cv) => commit((current) => ({ ...current, cvs: current.cvs.map((item) => (item.id === (current.current ?? current.cvs[0]?.id) ? update(item) : item)) })),
    [commit],
  );

  const add = (created: Cv) => commit((current) => (current.cvs.length >= LIMITS.cvs ? current : { cvs: [...current.cvs, created], current: created.id }));

  const download = (kind: "docx" | "txt" | "json") => {
    if (!cv) return;
    setNotice("");
    if (kind === "docx") saveBlob(new Blob([cvToDocx(cv) as unknown as BlobPart], { type: DOCX_TYPE }), cvFileName(cv, "docx"));
    else if (kind === "txt") saveBlob(new Blob([cvToText(cv)], { type: "text/plain;charset=utf-8" }), cvFileName(cv, "txt"));
    else saveBlob(new Blob([cvToJson(cv)], { type: "application/json" }), cvFileName(cv, "json"));
  };

  const openFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const parsed = parseCvFile(await file.text());
    setNotice(parsed ? tcv(lang, "imported", { name: parsed.name }) : tcv(lang, "importFailed"));
    if (parsed) add(parsed);
  };

  const isEmpty = cv ? !cv.profile.fullName && cv.experiences.length === 0 && cv.education.length === 0 && cv.skills.length === 0 : false;
  const t = (key: Parameters<typeof tcv>[1], params?: Record<string, string | number>) => tcv(lang, key, params);
  const small = "h-9 px-3 text-xs";

  return (
    <ToolPage title={t("title")} tagline={t("tagline")} wide>
      {hydrated && cv && (
        <>
          <div className="flex flex-wrap items-end gap-2" role="group" aria-label={t("cv")} data-no-print="">
            {renaming ? (
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = name.trim().slice(0, LIMITS.name);
                  if (next) edit((c) => ({ ...c, name: next, updated: Date.now() }));
                  setRenaming(false);
                }}
              >
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {t("renameCv")}
                  <input className={inputClass} value={name} maxLength={LIMITS.name} autoFocus onChange={(event) => setName(event.target.value)} />
                </label>
                <ActionButton type="submit">{t("save")}</ActionButton>
                <ActionButton variant="secondary" onClick={() => setRenaming(false)}>
                  {t("cancel")}
                </ActionButton>
              </form>
            ) : (
              <SelectField label={t("cv")} value={cv.id} onChange={(id) => commit((current) => ({ ...current, current: id }))} options={store.cvs.map((item) => ({ value: item.id, label: item.name }))} className="min-w-40" />
            )}
            {!renaming && (
              <>
                <ActionButton variant="secondary" className={small} disabled={store.cvs.length >= LIMITS.cvs} onClick={() => add(createCv(t("defaultName", { n: store.cvs.length + 1 }), lang as CvLang))}>
                  {t("newCv")}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  className={small}
                  disabled={store.cvs.length >= LIMITS.cvs}
                  onClick={() => add({ ...cleanCv(JSON.parse(JSON.stringify(cv))), id: newId(), name: t("copyOf", { name: cv.name }).slice(0, LIMITS.name), updated: Date.now() })}
                >
                  {t("duplicate")}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  className={small}
                  onClick={() => {
                    setName(cv.name);
                    setRenaming(true);
                  }}
                >
                  {t("rename")}
                </ActionButton>
                {confirming ? (
                  <span className="flex flex-wrap items-center gap-2 text-sm" role="alert">
                    {t("deleteAsk", { name: cv.name })}
                    <ActionButton
                      variant="secondary"
                      className="h-9 border-(--warning) px-3 text-xs text-(--warning)"
                      onClick={() => {
                        commit((current) => {
                          const rest = current.cvs.filter((item) => item.id !== cv.id);
                          if (rest.length === 0) {
                            const fresh = createCv(t("defaultName", { n: 1 }), lang as CvLang);
                            return { cvs: [fresh], current: fresh.id };
                          }
                          return { cvs: rest, current: rest[0]!.id };
                        });
                        setConfirming(false);
                      }}
                    >
                      {t("deleteYes")}
                    </ActionButton>
                    <ActionButton className={small} onClick={() => setConfirming(false)}>
                      {t("keep")}
                    </ActionButton>
                  </span>
                ) : (
                  <ActionButton variant="secondary" className={small} onClick={() => setConfirming(true)}>
                    {t("deleteCv")}
                  </ActionButton>
                )}
              </>
            )}
          </div>

          <section className={cn(panelClass, "flex flex-col gap-3")} aria-labelledby="cv-export" data-no-print="">
            <h2 id="cv-export" className="text-sm font-semibold">
              {t("exportTitle")}
            </h2>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                onClick={() => {
                  // The print copy is always in the page, so any tab can print.
                  printDocument(titleOf(cv));
                }}
              >
                <Printer aria-hidden="true" className="size-4" />
                {t("print")}
              </ActionButton>
              <ActionButton variant="secondary" onClick={() => download("docx")}>
                <Download aria-hidden="true" className="size-4" />
                {t("docx")}
              </ActionButton>
              <ActionButton variant="secondary" onClick={() => download("txt")}>
                <FileText aria-hidden="true" className="size-4" />
                {t("text")}
              </ActionButton>
              <ActionButton variant="secondary" onClick={() => download("json")}>
                <Download aria-hidden="true" className="size-4" />
                {t("json")}
              </ActionButton>
              <ActionButton variant="secondary" onClick={() => fileRef.current?.click()}>
                <Upload aria-hidden="true" className="size-4" />
                {t("open")}
              </ActionButton>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  void openFile(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
            <p className="text-xs text-(--muted-fg)">{t("printHint")}</p>
            <p className="text-sm text-(--warning) empty:hidden" role="status">
              {notice}
            </p>
          </section>

          <ImportText
            lang={lang}
            disabled={store.cvs.length >= LIMITS.cvs}
            onCreate={(created) => {
              add(created);
              setNotice(tcv(lang, "importedFromText", { name: created.name }));
            }}
          />

          <div data-no-print="" className="lg:hidden">
            <Tabs
              idPrefix="cv-view"
              label={t("tabs")}
              value={view}
              onChange={setView}
              tabs={[
                { id: "edit", label: t("tabEdit") },
                { id: "preview", label: t("tabPreview") },
              ]}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2" data-no-print="">
            <div role="tabpanel" id="cv-view-panel-edit" aria-labelledby="cv-view-tab-edit" className={cn("flex min-w-0 flex-col gap-3", view === "preview" && "max-lg:hidden")}>
              {isEmpty && (
                <div className={cn(panelClass, "flex flex-wrap items-center gap-3")}>
                  <p className="text-sm text-(--muted-fg)">{t("emptyHint")}</p>
                  <ActionButton variant="secondary" className={small} onClick={() => edit((c) => ({ ...exampleCv(c.settings.lang), id: c.id, name: c.name }))}>
                    {t("example")}
                  </ActionButton>
                </div>
              )}
              <CvEditor lang={lang} cv={cv} onChange={edit} />
            </div>
            <div role="tabpanel" id="cv-view-panel-preview" aria-labelledby="cv-view-tab-preview" className={cn("min-w-0 lg:sticky lg:top-20 lg:self-start", view === "edit" && "max-lg:hidden")}>
              <PreviewFrame cv={cv} />
            </div>
          </div>

          {/* What actually prints: the same sheet, with nothing around it. */}
          <div className={cn("cv-print-root hidden print:block", `cv-page-${cv.settings.paper}${cv.settings.density === "compact" ? "-compact" : ""}`)} aria-hidden="true" data-testid="cv-print">
            <CvDocument cv={cv} />
          </div>
        </>
      )}
    </ToolPage>
  );
}
