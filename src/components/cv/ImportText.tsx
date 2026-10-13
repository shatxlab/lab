import * as React from "react";

import { ActionButton, FilePicker, labelClass, panelClass, textareaClass } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import { importCvText } from "@/lib/cv/import";
import { tcv } from "@/lib/cv/i18n";
import type { Cv } from "@/lib/cv/schema";
import { cn } from "@/lib/viewer/utils";

const MAX_BYTES = 1024 * 1024;

/** Paste an old CV (or a LinkedIn profile as text) and get a CV to check and fix. */
export function ImportText({ lang, disabled, onCreate }: { lang: AppLang; disabled: boolean; onCreate: (cv: Cv) => void }) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState("");
  const result = React.useMemo(() => (text.trim() === "" ? null : importCvText(text, tcv(lang, "importedName"))), [text, lang]);
  const t = (key: Parameters<typeof tcv>[1], params?: Record<string, string | number>) => tcv(lang, key, params);

  const readFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_BYTES) return setError(t("importTooBig"));
    setError("");
    setText(await file.text());
  };

  const found = result?.found;
  const parts = found
    ? [
        found.name ? t("foundName", { name: result!.cv.profile.fullName }) : "",
        found.contact + found.links > 0 ? t("foundContact", { n: found.contact + found.links }) : "",
        found.jobs > 0 ? t("foundJobs", { n: found.jobs }) : "",
        found.schools > 0 ? t("foundSchools", { n: found.schools }) : "",
        found.projects > 0 ? t("foundProjects", { n: found.projects }) : "",
        found.skillGroups > 0 ? t("foundSkills", { n: found.skillGroups }) : "",
        found.customSections > 0 ? t("foundSections", { n: found.customSections }) : "",
        result!.cv.profile.summary ? t("foundSummary") : "",
      ].filter(Boolean)
    : [];

  return (
    <details className={cn(panelClass, "flex flex-col")} data-no-print="">
      <summary className="cursor-pointer text-sm font-semibold">{t("importTextTitle")}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-(--muted-fg)">{t("importTextHint")}</p>
        <label className={labelClass}>
          {t("importTextLabel")}
          <textarea className={cn(textareaClass, "min-h-40 font-sans")} value={text} spellCheck={false} onChange={(event) => setText(event.target.value)} />
        </label>
        <FilePicker lang={lang} accept=".txt,.md,text/plain,text/markdown" onFiles={(files) => void readFile(files)} prompt={t("importTextPick")} compact />
        {error && (
          <p className="text-sm text-(--warning)" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className="flex flex-col gap-2 text-sm">
            {result.empty ? (
              <p className="text-(--muted-fg)">{t("foundNothing")}</p>
            ) : (
              <>
                <p>
                  <span className="font-medium">{t("found")}</span> {parts.join(" · ")}
                </p>
                <p className="text-xs text-(--muted-fg)">{t("importCheck")}</p>
                <div>
                  <ActionButton
                    disabled={disabled}
                    onClick={() => {
                      onCreate(result.cv);
                      setText("");
                    }}
                  >
                    {t("importCreate")}
                  </ActionButton>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
