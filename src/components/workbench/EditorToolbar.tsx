import { MenuButton, type MenuItem } from "@/components/tools/MenuButton";
import { ActionButton } from "@/components/tools/ui";
import type { AppLang } from "@/lib/apps/lang";
import type { EditFormat } from "@/lib/workbench/editor";
import { wb } from "@/lib/workbench/i18n";
import { cn } from "@/lib/viewer/utils";

export interface EditorToolbarProps {
  lang: AppLang;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  formats: readonly EditFormat[];
  activeFormat: string;
  onFormatChange?: (id: string) => void;
  onSave: () => void;
  onSaveAs?: (id: string) => void;
  onRevert: () => void;
  onUndo: () => void;
  onRedo: () => void;
  saving?: boolean;
  /** False while the draft is invalid (it would save a broken file). */
  canSave?: boolean;
}

/**
 * Shared editing toolbar (Save · Save as ▾ · Revert · Undo · Redo · dirty
 * badge). Purely presentational: the owning editor holds the `EditSession`
 * and decides what each action does. SSR-safe — nothing touches the DOM at
 * module scope.
 */
export function EditorToolbar({
  lang,
  dirty,
  canUndo,
  canRedo,
  formats,
  activeFormat,
  onFormatChange,
  onSave,
  onSaveAs,
  onRevert,
  onUndo,
  onRedo,
  saving = false,
  canSave = true,
}: EditorToolbarProps) {
  const saveAsItems: MenuItem[] = formats.map((format) => ({
    id: format.id,
    label: format.label?.[lang] ?? format.id,
    onSelect: () => {
      onFormatChange?.(format.id);
      onSaveAs?.(format.id);
    },
    disabled: !onSaveAs,
  }));

  return (
    <div
      data-editor-toolbar=""
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-(--border) bg-(--surface) px-3 py-2",
      )}
    >
      <ActionButton onClick={onSave} disabled={!dirty || saving || !canSave}>
        {wb(lang, "save")}
      </ActionButton>

      {formats.length > 1 && (
        <MenuButton
          label={wb(lang, "saveAs")}
          menuLabel={wb(lang, "saveAs")}
          items={saveAsItems}
        />
      )}

      <ActionButton variant="secondary" onClick={onRevert} disabled={!dirty}>
        {wb(lang, "revert")}
      </ActionButton>

      <ActionButton variant="secondary" onClick={onUndo} disabled={!canUndo}>
        {wb(lang, "undo")}
      </ActionButton>

      <ActionButton variant="secondary" onClick={onRedo} disabled={!canRedo}>
        {wb(lang, "redo")}
      </ActionButton>

      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-(--muted-fg)"
        data-active-format={activeFormat}
      >
        {dirty && (
          <>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-(--accent)" />
            {wb(lang, "unsavedChanges")}
          </>
        )}
      </span>
    </div>
  );
}
