import * as React from "react";

import { Workspace } from "@/components/board/Workspace";
import { ActionButton, SelectField, inputClass, ToolPage } from "@/components/tools/ui";
import { useAppLang } from "@/lib/apps/use-app-lang";
import { tb } from "@/lib/board/i18n";
import { takeBoardHandoff } from "@/lib/board/handoff";
import { MAX_BOARDS, createBoard, type Board, type BoardElement, type View } from "@/lib/board/model";
import { emptyStore, parseBoardFile, readBoardStore, writeBoardStore, type BoardStore } from "@/lib/board/storage";

export default function BoardApp() {
  const lang = useAppLang();
  const [store, setStore] = React.useState<BoardStore>(emptyStore);
  const storeRef = React.useRef(store);
  const [hydrated, setHydrated] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  const commitStore = React.useCallback((update: (current: BoardStore) => BoardStore) => {
    const next = update(storeRef.current);
    if (next === storeRef.current) return;
    storeRef.current = next;
    setStore(next);
    writeBoardStore(next);
  }, []);

  React.useEffect(() => {
    let loaded = readBoardStore();
    if (loaded.boards.length === 0) {
      const first = createBoard(tb("en", "defaultName", { n: 1 }));
      loaded = { ...loaded, boards: [first], current: first.id };
    }
    // A board sent from the workbench's "Open in Whiteboard" arrives as a new board.
    const sent = takeBoardHandoff();
    const arrived = sent ? parseBoardFile(sent.text) : null;
    if (arrived && loaded.boards.length < MAX_BOARDS) {
      const name = sent!.name.replace(/\.[^./\\]+$/, "").trim();
      const added = { ...arrived, name: (name || arrived.name).slice(0, 60) };
      loaded = { ...loaded, boards: [...loaded.boards, added], current: added.id };
      setNotice(tb("en", "imported", { name: added.name }));
    }
    storeRef.current = loaded;
    setStore(loaded);
    if (arrived) writeBoardStore(loaded);
    setHydrated(true);
  }, []);

  const board = store.boards.find((item) => item.id === store.current) ?? store.boards[0];

  const save = React.useCallback(
    (id: string) => (elements: BoardElement[], view: View) =>
      commitStore((current) => {
        const target = current.boards.find((item) => item.id === id);
        // Nothing to write if the board is gone or unchanged since the last save.
        if (!target || (target.elements === elements && target.view.x === view.x && target.view.y === view.y && target.view.zoom === view.zoom)) return current;
        return { ...current, boards: current.boards.map((item) => (item.id === id ? { ...item, elements, view, updated: Date.now() } : item)) };
      }),
    [commitStore],
  );

  const addBoard = (created: Board) =>
    commitStore((current) => (current.boards.length >= MAX_BOARDS ? current : { ...current, boards: [...current.boards, created], current: created.id }));

  const rename = () => {
    const next = name.trim().slice(0, 60);
    if (next && board) commitStore((current) => ({ ...current, boards: current.boards.map((item) => (item.id === board.id ? { ...item, name: next } : item)) }));
    setRenaming(false);
  };

  const remove = () => {
    if (!board) return;
    commitStore((current) => {
      const rest = current.boards.filter((item) => item.id !== board.id);
      if (rest.length === 0) {
        const fresh = createBoard(tb(lang, "defaultName", { n: 1 }));
        return { ...current, boards: [fresh], current: fresh.id };
      }
      return { ...current, boards: rest, current: rest[0]!.id };
    });
    setConfirming(false);
  };

  return (
    <ToolPage title={tb(lang, "title")} tagline={tb(lang, "tagline")} wide>
      {hydrated && board && (
        <>
          <div className="flex flex-wrap items-end gap-2" role="group" aria-label={tb(lang, "boards")}>
            {renaming ? (
              <form
                className="flex items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  rename();
                }}
              >
                <label className="flex flex-col gap-1 text-sm font-medium">
                  {tb(lang, "renameBoard")}
                  <input className={inputClass} value={name} maxLength={60} autoFocus onChange={(event) => setName(event.target.value)} />
                </label>
                <ActionButton type="submit">{tb(lang, "save")}</ActionButton>
                <ActionButton variant="secondary" onClick={() => setRenaming(false)}>
                  {tb(lang, "cancel")}
                </ActionButton>
              </form>
            ) : (
              <SelectField
                label={tb(lang, "board")}
                value={board.id}
                onChange={(id) => commitStore((current) => ({ ...current, current: id }))}
                options={store.boards.map((item) => ({ value: item.id, label: item.name }))}
                className="min-w-40"
              />
            )}
            {!renaming && (
              <>
                <ActionButton
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  disabled={store.boards.length >= MAX_BOARDS}
                  onClick={() => addBoard(createBoard(tb(lang, "defaultName", { n: store.boards.length + 1 })))}
                >
                  {tb(lang, "newBoard")}
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  className="h-9 px-3 text-xs"
                  onClick={() => {
                    setName(board.name);
                    setRenaming(true);
                  }}
                >
                  {tb(lang, "rename")}
                </ActionButton>
                {confirming ? (
                  <span className="flex flex-wrap items-center gap-2 text-sm" role="alert">
                    {tb(lang, "deleteAsk", { name: board.name })}
                    <ActionButton variant="secondary" className="border-(--warning) text-(--warning)" onClick={remove}>
                      {tb(lang, "deleteYes")}
                    </ActionButton>
                    <ActionButton onClick={() => setConfirming(false)}>{tb(lang, "keep")}</ActionButton>
                  </span>
                ) : (
                  <ActionButton variant="secondary" className="h-9 px-3 text-xs" onClick={() => setConfirming(true)}>
                    {tb(lang, "deleteBoard")}
                  </ActionButton>
                )}
              </>
            )}
          </div>

          <p className="text-sm text-(--muted-fg) empty:hidden" role="status">
            {notice}
          </p>

          <Workspace
            key={board.id}
            lang={lang}
            board={board}
            grid={store.grid}
            onGrid={(on) => commitStore((current) => ({ ...current, grid: on }))}
            snap={store.snap}
            onSnap={(on) => commitStore((current) => ({ ...current, snap: on }))}
            onSave={save(board.id)}
            onImport={addBoard}
            onNotice={setNotice}
          />
        </>
      )}
    </ToolPage>
  );
}
