import * as React from "react";

import { Workspace } from "@/components/board/Workspace";
import { ToolPage } from "@/components/tools/ui";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { tb } from "@/lib/board/i18n";
import type { BoardElement, View } from "@/lib/board/model";
import { emptyBoard, readBoard, writeBoard, type BoardState } from "@/lib/board/storage";

export default function BoardApp() {
  const lang = useAppLang();
  const [board, setBoard] = React.useState<BoardState | null>(null);
  const lastSaved = React.useRef<BoardState | null>(null);

  React.useEffect(() => {
    const loaded = readBoard();
    lastSaved.current = loaded;
    setBoard(loaded);
  }, []);

  const save = React.useCallback((elements: BoardElement[], view: View) => {
    const previous = lastSaved.current ?? emptyBoard();
    // Nothing to write if nothing changed since the last save.
    if (previous.elements === elements && previous.view.x === view.x && previous.view.y === view.y && previous.view.zoom === view.zoom) return;
    const next = { elements, view };
    lastSaved.current = next;
    writeBoard(next);
  }, []);

  return (
    <ToolPage title={tb(lang, "title")} tagline={tb(lang, "tagline")} wide>
      {board && <Workspace lang={lang} board={board} onSave={save} />}
    </ToolPage>
  );
}
