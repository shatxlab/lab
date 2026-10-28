/*
 * A throwaway probe for the folder-backup plan: can this browser (Android Chrome in particular) link a
 * folder once and keep writing a backup file into it by itself? It answers, on a real device:
 *  - does the folder permission survive a reload, closing the browser, a restart (`queryPermission` on load)?
 *  - can a file be created and written with no tap at all (the automatic write on load)?
 *  - does a write started when the page is hidden (switching apps) land?
 *  - does an aborted write leave the old file intact (atomic enough to alternate two files)?
 *  - does "save as" create a new file (a known Android bug only overwrites)?
 *  - after clearing site data, are the files still there (pick the same folder again)?
 * Everything is logged to IndexedDB so the answers from earlier visits stay on screen; "Copy report"
 * puts the whole log on the clipboard.
 */

interface PermissionDescriptor {
  mode: "read" | "readwrite";
}

interface ProbeDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?(descriptor: PermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor: PermissionDescriptor): Promise<PermissionState>;
}

interface PickerWindow {
  showDirectoryPicker?(options?: { id?: string; mode?: "read" | "readwrite"; startIn?: string }): Promise<ProbeDirectoryHandle>;
  showSaveFilePicker?(options?: { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[] }): Promise<FileSystemFileHandle>;
}

interface LogEntry {
  at: string;
  visit: number;
  text: string;
}

interface SlotFile {
  slot: "a" | "b";
  at: string;
  seq: number;
  visit: number;
}

const DB_NAME = "lab-backup-probe";
const STORE = "kv";
const SLOTS = ["a", "b"] as const;
const slotName = (slot: "a" | "b") => `lab-probe-${slot}.json`;
const HIDDEN_FILE = "lab-probe-hidden.json";
const ABORT_FILE = "lab-probe-abort.json";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function describeError(error: unknown): string {
  if (error instanceof DOMException) return `${error.name}: ${error.message}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function readJson<T>(dir: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string): Promise<void> {
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await writable.write(text);
  await writable.close();
}

export function startProbe(root: HTMLElement): void {
  const picker = window as unknown as PickerWindow;
  const logView = root.querySelector<HTMLPreElement>("[data-log]")!;
  const status = root.querySelector<HTMLParagraphElement>("[data-status]")!;
  const button = (name: string) => root.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;

  let visit = 0;
  let log: LogEntry[] = [];
  let dir: ProbeDirectoryHandle | null = null;
  let granted = false;

  const render = () => {
    logView.textContent = log.map((entry) => `#${entry.visit} ${entry.at.slice(5, 19).replace("T", " ")}  ${entry.text}`).join("\n");
    status.textContent = dir ? `Folder: ${dir.name} — permission ${granted ? "granted" : "not granted"}` : "No folder linked.";
    button("allow").hidden = !dir || granted;
    button("write").disabled = !granted;
    button("abort").disabled = !granted;
    button("list").disabled = !granted;
    button("forget").disabled = !dir;
  };

  const note = async (text: string) => {
    log.push({ at: new Date().toISOString(), visit, text });
    if (log.length > 400) log = log.slice(-400);
    render();
    await idbSet("log", log);
  };

  const attempt = async (label: string, run: () => Promise<string | void>) => {
    try {
      const result = await run();
      await note(`${label}: OK${result ? ` — ${result}` : ""}`);
      return true;
    } catch (error) {
      await note(`${label}: FAILED — ${describeError(error)}`);
      return false;
    }
  };

  /** Write the older of the two slot files, then read it back. */
  const writeSlot = async (how: string) => {
    if (!dir) return;
    const current = dir;
    await attempt(`write (${how})`, async () => {
      const existing = await Promise.all(SLOTS.map((slot) => readJson<SlotFile>(current, slotName(slot))));
      const seq = Math.max(0, ...existing.map((file) => file?.seq ?? 0)) + 1;
      const older = existing[0] === null ? 0 : existing[1] === null ? 1 : existing[0].seq <= existing[1].seq ? 0 : 1;
      const slot = SLOTS[older];
      const body: SlotFile = { slot, at: new Date().toISOString(), seq, visit };
      await writeText(current, slotName(slot), JSON.stringify(body));
      const back = await readJson<SlotFile>(current, slotName(slot));
      if (back?.seq !== seq) throw new Error(`read back seq ${back?.seq} instead of ${seq}`);
      return `${slotName(slot)} seq ${seq}`;
    });
  };

  const checkPermission = async (how: string) => {
    if (!dir) return;
    if (!dir.queryPermission) {
      granted = true;
      await note(`queryPermission missing (${how}); assuming granted`);
      return;
    }
    const state = await dir.queryPermission({ mode: "readwrite" });
    granted = state === "granted";
    await note(`permission on ${how}: ${state}`);
  };

  const listFolder = async () => {
    if (!dir) return;
    const current = dir;
    await attempt("list folder", async () => {
      const names: string[] = [];
      if (typeof current.values === "function") for await (const entry of current.values()) names.push(`${entry.name}${entry.kind === "directory" ? "/" : ""}`);
      const slots = await Promise.all(SLOTS.map((slot) => readJson<SlotFile>(current, slotName(slot))));
      const latest = slots.filter((file): file is SlotFile => file !== null).sort((x, y) => y.seq - x.seq)[0];
      return `${names.length} entries [${names.join(", ")}]; newest slot: ${latest ? `${latest.slot} seq ${latest.seq} from ${latest.at}` : "none"}`;
    });
  };

  const checkHiddenWrite = async () => {
    if (!dir) return;
    const tried = await idbGet<string>("hiddenTried");
    if (!tried) return;
    const landed = await readJson<{ at: string }>(dir, HIDDEN_FILE);
    await note(`last write when hidden (tried ${tried}): ${landed?.at === tried ? "LANDED" : `missing (file has ${landed?.at ?? "nothing"})`}`);
  };

  const environment = async () => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const has = (name: string, value: unknown) => `${name}=${value ? "yes" : "no"}`;
    await note(
      [
        navigator.userAgent,
        has("secure", window.isSecureContext),
        has("installed", standalone),
        has("showDirectoryPicker", picker.showDirectoryPicker),
        has("showSaveFilePicker", picker.showSaveFilePicker),
        has("queryPermission", "FileSystemHandle" in window && "queryPermission" in FileSystemHandle.prototype),
        has("storage.persist", navigator.storage?.persist),
      ].join(" | "),
    );
    if (navigator.storage?.persisted) await note(`storage persisted: ${await navigator.storage.persisted()}`);
  };

  button("pick").addEventListener("click", async () => {
    if (!picker.showDirectoryPicker) return void note("pick folder: showDirectoryPicker is not available");
    const ok = await attempt("pick folder", async () => {
      try {
        dir = await picker.showDirectoryPicker!({ id: "labprobe", mode: "readwrite", startIn: "documents" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        await note(`pick with options failed (${describeError(error)}), retrying without`);
        dir = await picker.showDirectoryPicker!();
      }
      await idbSet("dir", dir);
      return dir.name;
    });
    if (!ok) return;
    await checkPermission("pick");
    if (!granted && dir?.requestPermission) {
      granted = (await dir.requestPermission({ mode: "readwrite" })) === "granted";
      await note(`requestPermission after pick: ${granted ? "granted" : "denied"}`);
    }
    if (granted) {
      await listFolder();
      await writeSlot("after pick");
    }
  });

  button("allow").addEventListener("click", async () => {
    if (!dir?.requestPermission) return;
    const current = dir;
    await attempt("request permission", async () => {
      const state = await current.requestPermission!({ mode: "readwrite" });
      granted = state === "granted";
      return state;
    });
    if (granted) await writeSlot("after allow");
  });

  button("write").addEventListener("click", () => void writeSlot("button"));
  button("list").addEventListener("click", () => void listFolder());

  button("abort").addEventListener("click", async () => {
    if (!dir) return;
    const current = dir;
    await attempt("aborted write keeps the old file", async () => {
      await writeText(current, ABORT_FILE, "ORIGINAL");
      const writable = await (await current.getFileHandle(ABORT_FILE)).createWritable();
      await writable.write("PARTIAL WRITE THAT SHOULD NEVER LAND");
      await writable.abort();
      const after = await (await (await current.getFileHandle(ABORT_FILE)).getFile()).text();
      if (after !== "ORIGINAL") throw new Error(`file now holds "${after.slice(0, 40)}"`);
      return "still ORIGINAL";
    });
  });

  button("saveas").addEventListener("click", async () => {
    if (!picker.showSaveFilePicker) return void note("save as: showSaveFilePicker is not available");
    await attempt("save as a new file", async () => {
      const handle = await picker.showSaveFilePicker!({
        suggestedName: `lab-probe-saveas-${Date.now()}.json`,
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify({ at: new Date().toISOString() }));
      await writable.close();
      return handle.name;
    });
  });

  button("persist").addEventListener("click", async () => {
    if (!navigator.storage?.persist) return void note("storage.persist is not available");
    await attempt("storage.persist", async () => String(await navigator.storage.persist()));
  });

  button("forget").addEventListener("click", async () => {
    dir = null;
    granted = false;
    await idbDelete("dir");
    await note("forgot the folder (like clearing site data, but the log stays)");
  });

  button("copy").addEventListener("click", async () => {
    const text = logView.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = "Report copied.";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(logView);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      status.textContent = "Copy failed; the log is selected, copy it by hand.";
    }
  });

  button("clearlog").addEventListener("click", async () => {
    log = [];
    await idbSet("log", log);
    render();
  });

  // Switching apps is the moment a real backup would save; try it and check on the next visit.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden" || !dir || !granted) return;
    const at = new Date().toISOString();
    void idbSet("hiddenTried", at);
    void writeText(dir, HIDDEN_FILE, JSON.stringify({ at })).catch(() => undefined);
  });

  void (async () => {
    try {
      log = (await idbGet<LogEntry[]>("log")) ?? [];
      visit = ((await idbGet<number>("visit")) ?? 0) + 1;
      await idbSet("visit", visit);
      await note(`--- visit ${visit} ---`);
      await environment();
      dir = (await idbGet<ProbeDirectoryHandle>("dir")) ?? null;
      if (!dir) {
        await note("no linked folder stored (first visit, or site data was cleared)");
        return;
      }
      await note(`stored folder: ${dir.name}`);
      await checkPermission("load, no tap");
      if (granted) {
        await writeSlot("automatic, no tap");
        await checkHiddenWrite();
      }
    } catch (error) {
      await note(`startup failed: ${describeError(error)}`).catch(() => undefined);
    } finally {
      render();
    }
  })();
}
