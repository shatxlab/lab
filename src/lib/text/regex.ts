import { runRegex, type RegexRequest, type RegexResponse } from "@/lib/text/regex-core";

export type { RegexMatch, RegexRequest, RegexResponse } from "@/lib/text/regex-core";

/** How long a pattern may run before it is abandoned as a runaway. */
export const REGEX_TIMEOUT_MS = 2000;

let worker: Worker | undefined;
let nextId = 0;

function getWorker(): Worker | undefined {
  if (typeof Worker === "undefined") return undefined;
  worker ??= new Worker(new URL("./regex.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

/**
 * Evaluate a pattern in a Web Worker with a time limit: a pattern like
 * `(a+)+$` on a long string would otherwise freeze the tab for good. On
 * timeout the worker is terminated and an error is returned. Without Worker
 * support (tests, very old browsers) it falls back to running inline.
 */
export function testRegex(request: RegexRequest, timeoutMs = REGEX_TIMEOUT_MS): Promise<RegexResponse | { ok: false; error: "timeout" }> {
  let active: Worker | undefined;
  try {
    active = getWorker();
  } catch {
    active = undefined;
  }
  if (!active) return Promise.resolve(runRegex(request));
  const current = active;

  return new Promise((resolve) => {
    const id = (nextId += 1);
    const timer = setTimeout(() => {
      current.terminate();
      if (worker === current) worker = undefined;
      current.removeEventListener("message", onMessage);
      resolve({ ok: false, error: "timeout" });
    }, timeoutMs);

    function onMessage(event: MessageEvent<{ id: number; response: RegexResponse }>) {
      if (event.data.id !== id) return;
      clearTimeout(timer);
      current.removeEventListener("message", onMessage);
      resolve(event.data.response);
    }

    current.addEventListener("message", onMessage);
    current.postMessage({ id, request });
  });
}
