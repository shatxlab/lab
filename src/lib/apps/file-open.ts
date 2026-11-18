/**
 * Shared file-open/save helper for the utilities suite.
 *
 * Two acquisition paths:
 *  - File System Access API (Chromium desktop): files stay on disk and are
 *    read lazily per-slice via the handle. NO full-file read ever happens.
 *  - <input type="file"> fallback (iOS/Safari/Firefox): there is no handle,
 *    so the whole blob is read into memory ONCE on the first readSlice call
 *    and cached; later slices come from that cache. This is the documented
 *    degradation path — keep files opened this way reasonably small.
 *
 * Every browser API sits behind an injectable seam (OpenDeps / SaveBlobDeps,
 * defaulted lazily from window) so the decision logic runs in plain node tests.
 */

export interface FileSource {
  file: File;
  /** Present only when the File System Access picker was used. */
  handle?: FileSystemFileHandle;
  /** Read `length` bytes starting at `offset`; clamps past EOF to available bytes. */
  readSlice(offset: number, length: number): Promise<Uint8Array>;
}

export interface FileOpenOptions {
  multiple?: boolean;
  accept?: string;
  deps?: OpenDeps;
}

/**
 * Injectable seams for openFiles. When `showOpenFilePicker` is provided the
 * FSA path is taken; otherwise `createFileInput` is used.
 */
export interface OpenDeps {
  showOpenFilePicker?: (
    options: OpenFilePickerOptions,
  ) => Promise<FileSystemFileHandle[]>;
  createFileInput?: (options: { multiple: boolean; accept?: string }) => Promise<File[]>;
}

/** Minimal anchor surface saveBlob drives. */
export interface AnchorLike {
  href: string;
  download: string;
  click(): void;
}

export interface SaveBlobDeps {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  createAnchor(): AnchorLike;
  /** Runs the callback after a tick; defaults to setTimeout(fn, 0). */
  schedule(fn: () => void): unknown;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/**
 * Default seams, resolved lazily at call time so importing this module in
 * node never touches browser globals.
 */
export function defaultOpenDeps(): OpenDeps {
  const w = typeof window !== "undefined" ? window : undefined;
  return {
    showOpenFilePicker: w?.showOpenFilePicker?.bind(w) ?? undefined,
    createFileInput: (options) => openViaFileInput(options),
  };
}

/**
 * Fallback picker. Resolves [] on cancel (the `cancel` event) — callers get
 * an empty list, not an exception.
 */
async function openViaFileInput(options: {
  multiple: boolean;
  accept?: string;
}): Promise<File[]> {
  const doc = typeof document !== "undefined" ? document : undefined;
  if (!doc) throw new Error("file-open: no document available for the input fallback");

  const input = doc.createElement("input");
  input.type = "file";
  input.multiple = options.multiple;
  if (options.accept) input.accept = options.accept;
  input.style.display = "none";
  doc.body.appendChild(input);

  return new Promise<File[]>((resolve) => {
    const cleanup = () => {
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel);
      input.remove();
    };
    const onChange = () => {
      cleanup();
      resolve(Array.from(input.files ?? []));
    };
    const onCancel = () => {
      cleanup();
      resolve([]);
    };
    input.addEventListener("change", onChange);
    input.addEventListener("cancel", onCancel);
    input.click();
  });
}

/**
 * Convert an `<input accept>` string ("image/png,.txt") into FSA picker
 * `types`. Extension-only tokens are grouped under a permissive MIME since
 * the FSA picker keys accepts off MIME types; the browser still enforces
 * user-visible filtering through its own extension handling.
 */
export function acceptToPickerTypes(
  accept: string,
): NonNullable<OpenFilePickerOptions["types"]> {
  const acceptMap: Record<string, string[]> = {};
  for (const token of accept.split(",").map((t) => t.trim()).filter(Boolean)) {
    if (token.startsWith(".")) {
      (acceptMap["application/octet-stream"] ??= []).push(token);
    } else {
      acceptMap[token] ??= [];
    }
  }
  return [{ description: "Accepted files", accept: acceptMap }];
}

export async function openFiles(opts: FileOpenOptions = {}): Promise<FileSource[]> {
  const { multiple = false, accept, deps = defaultOpenDeps() } = opts;

  if (deps.showOpenFilePicker) {
    try {
      const pickerOptions: OpenFilePickerOptions = { multiple };
      if (accept) pickerOptions.types = acceptToPickerTypes(accept);
      const handles = await deps.showOpenFilePicker(pickerOptions);
      return Promise.all(
        handles.map(async (handle) => ({
          // Metadata only (name/size/type) — content is never read here;
          // every readSlice re-gets the file from the handle.
          file: await handle.getFile(),
          handle,
          readSlice: (offset: number, length: number) =>
            fsaReadSlice(handle, offset, length),
        })),
      );
    } catch (err) {
      if (isAbortError(err)) return []; // user closed the picker
      throw err;
    }
  }

  const files = deps.createFileInput
    ? await deps.createFileInput({ multiple, accept })
    : [];

  return files.map((file) => ({
    file,
    readSlice: makeInputReadSlice(file),
  }));
}

/**
 * FSA path: no full-file read. Each slice re-gets the File from the handle
 * (so on-disk changes are picked up) and reads only the requested range.
 */
async function fsaReadSlice(
  handle: FileSystemFileHandle,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  const file = await handle.getFile();
  const start = Math.max(0, offset);
  const buffer = await file.slice(start, start + Math.max(0, length)).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Input path degradation: `<input type=file>` gives no random access, so the
 * whole blob is read into memory once and cached; every readSlice call after
 * the first slices the cached bytes. A full-file range (the common case for
 * this island suite — PDFs/images are read in one go) returns the cached
 * array itself, not a same-size copy. If the initial read fails the cached
 * promise is dropped, so a retry actually re-reads and never re-throws the
 * poisoned rejection forever.
 */
function makeInputReadSlice(file: File): (offset: number, length: number) => Promise<Uint8Array> {
  let cache: Promise<Uint8Array> | undefined;
  return async (offset: number, length: number) => {
    cache ??= file
      .arrayBuffer()
      .then((buffer) => new Uint8Array(buffer))
      .catch((err: unknown) => {
        cache = undefined; // don't cache a rejected promise — allow retries
        throw err;
      });
    const bytes = await cache;
    const start = Math.max(0, Math.min(offset, bytes.length));
    const end = Math.max(start, Math.min(offset + Math.max(0, length), bytes.length));
    if (start === 0 && end === bytes.length) return bytes;
    return bytes.slice(start, end);
  };
}

export function defaultSaveDeps(): SaveBlobDeps {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
    schedule: (fn) => window.setTimeout(fn, 0),
  };
}

/**
 * Trigger a client-side download: object URL → hidden anchor click →
 * revoke the URL after a tick so the browser can start the download first.
 */
export function saveBlob(
  blob: Blob,
  filename: string,
  deps: SaveBlobDeps = defaultSaveDeps(),
): void {
  const url = deps.createObjectURL(blob);
  const anchor = deps.createAnchor();
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  deps.schedule(() => deps.revokeObjectURL(url));
}
