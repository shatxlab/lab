import * as React from "react";

import { Tabs, ToolPage } from "@/components/tools/ui";
import { QrGenerateOperation, QrScanOperation } from "@/components/workbench/operations/QrOperations";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { tq } from "@/lib/qr/i18n";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";

type TabId = "create" | "scan";

/**
 * The `/qr` page is a thin host over the workbench QR operations, so the same
 * components can run inside the workbench with a text or image asset. The seed
 * handed from the scanner to the generator keeps working across the tabs.
 */
export default function QrTools() {
  const lang = useAppLang();
  const [tab, setTab] = React.useState<TabId>("create");
  /** Text handed from the scanner to the generator ("create a code from this"). */
  const [seed, setSeed] = React.useState<string | null>(null);

  return (
    <ToolPage title={tq(lang, "title")} tagline={tq(lang, "tagline")} wide>
      <Tabs
        idPrefix="qr-tools"
        label={tq(lang, "tabs")}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "create", label: tq(lang, "tabCreate") },
          { id: "scan", label: tq(lang, "tabScan") },
        ]}
      />
      <div role="tabpanel" id={`qr-tools-panel-${tab}`} aria-labelledby={`qr-tools-tab-${tab}`} className="flex flex-col gap-4">
        {tab === "create" && <QrGenerateOperation lang={lang} assets={EMPTY_ASSETS} seed={seed} />}
        {tab === "scan" && (
          <QrScanOperation
            lang={lang}
            assets={EMPTY_ASSETS}
            onUse={(text) => {
              setSeed(text);
              setTab("create");
            }}
          />
        )}
      </div>
    </ToolPage>
  );
}
