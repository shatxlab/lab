import * as React from "react";

import { Tabs, ToolPage } from "@/components/tools/ui";
import {
  TextCaseOperation,
  TextCountOperation,
  TextDiffOperation,
  TextRegexOperation,
} from "@/components/workbench/operations/TextOperations";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { tt } from "@/lib/text/i18n";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";

type TabId = "diff" | "count" | "case" | "regex";

/**
 * The `/text` page is now a thin host over the workbench text operations. The
 * tabs, layout and copy live here; the behaviour lives in the operations, so
 * the same components can run inside the workbench with file assets.
 */
export default function TextTools() {
  const lang = useAppLang();
  const [tab, setTab] = React.useState<TabId>("diff");

  return (
    <ToolPage title={tt(lang, "title")} tagline={tt(lang, "tagline")} wide>
      <Tabs
        idPrefix="text-tools"
        label={tt(lang, "tabs")}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "diff", label: tt(lang, "tabDiff") },
          { id: "count", label: tt(lang, "tabCount") },
          { id: "case", label: tt(lang, "tabCase") },
          { id: "regex", label: tt(lang, "tabRegex") },
        ]}
      />
      <div role="tabpanel" id={`text-tools-panel-${tab}`} aria-labelledby={`text-tools-tab-${tab}`} className="flex flex-col gap-4">
        {tab === "diff" && <TextDiffOperation lang={lang} assets={EMPTY_ASSETS} />}
        {tab === "count" && <TextCountOperation lang={lang} assets={EMPTY_ASSETS} />}
        {tab === "case" && <TextCaseOperation lang={lang} assets={EMPTY_ASSETS} />}
        {tab === "regex" && <TextRegexOperation lang={lang} assets={EMPTY_ASSETS} />}
      </div>
    </ToolPage>
  );
}
