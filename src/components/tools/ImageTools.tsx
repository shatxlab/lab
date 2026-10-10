import { ToolPage } from "@/components/tools/ui";
import { ImageOperation } from "@/components/workbench/operations/ImageOperations";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { ti } from "@/lib/image/i18n";
import { EMPTY_ASSETS } from "@/lib/workbench/operation";

/**
 * The `/image` page is a thin host over the workbench image operation, so the
 * same component can run inside the workbench with an image asset selected and
 * hide its own file picker.
 */
export default function ImageTools() {
  const lang = useAppLang();
  return (
    <ToolPage title={ti(lang, "title")} tagline={ti(lang, "tagline")} wide>
      <ImageOperation lang={lang} assets={EMPTY_ASSETS} />
    </ToolPage>
  );
}
