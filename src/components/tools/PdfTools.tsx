import * as React from "react";

import { Tabs, ToolPage } from "@/components/tools/ui";
import {
  PdfMergeOperation,
  PdfOrganizeOperation,
  PdfSplitOperation,
} from "@/components/workbench/operations/PdfOperations";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { tp } from "@/lib/pdf/i18n";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";

type TabId = "merge" | "split" | "organize";

/**
 * The `/pdf` page is now a thin host over the workbench PDF operations. The
 * tabs, layout and copy live here; the behaviour lives in the operations, so
 * the same components can run inside the workbench with file assets.
 */
export default function PdfTools() {
  const lang = useAppLang();
  const [tab, setTab] = React.useState<TabId>("merge");

  return (
    <ToolPage title={tp(lang, "title")} tagline={tp(lang, "tagline")} wide>
      <Tabs
        idPrefix="pdf-tools"
        label={tp(lang, "tabs")}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "merge", label: tp(lang, "tabMerge") },
          { id: "split", label: tp(lang, "tabSplit") },
          { id: "organize", label: tp(lang, "tabOrganize") },
        ]}
      />
      <div role="tabpanel" id={`pdf-tools-panel-${tab}`} aria-labelledby={`pdf-tools-tab-${tab}`} className="flex flex-col gap-4">
        {tab === "merge" && <PdfMergeOperation lang={lang} assets={EMPTY_ASSETS} />}
        {tab === "split" && <PdfSplitOperation lang={lang} assets={EMPTY_ASSETS} />}
        {tab === "organize" && <PdfOrganizeOperation lang={lang} assets={EMPTY_ASSETS} />}
      </div>
    </ToolPage>
  );
}
