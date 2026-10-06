import { runRegex, type RegexRequest, type RegexResponse } from "@/lib/text/regex-core";

/** Runs the user's pattern off the main thread so a catastrophic one can be abandoned. */
self.onmessage = (event: MessageEvent<{ id: number; request: RegexRequest }>) => {
  const { id, request } = event.data;
  const response: RegexResponse = runRegex(request);
  (self as unknown as Worker).postMessage({ id, response });
};
