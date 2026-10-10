import * as React from "react";

import { Tabs, ToolPage } from "@/components/tools/ui";
import {
  DataConvertOperation,
  DataEncodeOperation,
  DataHashOperation,
  DataUuidOperation,
} from "@/components/workbench/operations/ConvertOperations";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { tv } from "@/lib/convert/i18n";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";

type TabId = "data" | "encode" | "hash" | "uuid";

/**
 * The `/convert` page is a thin host over the workbench data operations, so
 * the same components can run inside the workbench with a JSON/YAML/TOML file.
 */
export default function ConvertTools() {
  const lang = useAppLang();
  const [tab, setTab] = React.useState<TabId>("data");

  return (
    <ToolPage title={tv(lang, "title")} tagline={tv(lang, "tagline")} wide>
      <Tabs
        idPrefix="convert-tools"
        label={tv(lang, "tabs")}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "data", label: tv(lang, "tabData") },
          { id: "encode", label: tv(lang, "tabEncode") },
          { id: "hash", label: tv(lang, "tabHash") },
          { id: "uuid", label: tv(lang, "tabUuid") },
        ]}
      />
      <div role="tabpanel" id={`convert-tools-panel-${tab}`} aria-labelledby={`convert-tools-tab-${tab}`} className="flex flex-col gap-4">
        {tab === "data" && <DataConvertOperation lang={lang} assets={EMPTY_ASSETS} />}
        {tab === "encode" && <DataEncodeOperation lang={lang} assets={EMPTY_ASSETS} />}
        {tab === "hash" && <DataHashOperation lang={lang} assets={EMPTY_ASSETS} />}
        {tab === "uuid" && <DataUuidOperation lang={lang} assets={EMPTY_ASSETS} />}
      </div>
    </ToolPage>
  );
}
