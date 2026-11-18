import * as React from "react";

import { tpw } from "@/lib/apps/pwa-i18n";
import { withBase } from "@/lib/apps/paths";
import { useAppLang } from "@/lib/apps/use-app-lang";

/** How often an open tab asks the server whether a newer worker exists. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

type Notice = { kind: "update"; worker: ServiceWorker } | { kind: "offline" } | null;

/**
 * Registers the service worker (production only) and tells the visitor about
 * two moments: the first time the app becomes available offline, and when a
 * new version has been downloaded and is waiting for them to switch.
 */
export default function PwaRegister() {
  const lang = useAppLang();
  const [notice, setNotice] = React.useState<Notice>(null);
  const refreshing = React.useRef(false);

  React.useEffect(() => {
    if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;
    let timer: number | undefined;

    const watch = (worker: ServiceWorker) => {
      worker.addEventListener("statechange", () => {
        if (worker.state !== "installed") return;
        // A controller already exists → this is an update; otherwise it is the first install.
        setNotice(container.controller ? { kind: "update", worker } : { kind: "offline" });
      });
    };

    const onControllerChange = () => {
      // Only reload when the visitor asked for the update, not on first-install claim.
      if (refreshing.current) window.location.reload();
    };
    container.addEventListener("controllerchange", onControllerChange);

    container
      .register(withBase("/sw.js"), { scope: withBase("/") + (withBase("/").endsWith("/") ? "" : "/") })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && container.controller) setNotice({ kind: "update", worker: reg.waiting });
        if (reg.installing) watch(reg.installing);
        reg.addEventListener("updatefound", () => reg.installing && watch(reg.installing));
        timer = window.setInterval(() => void reg.update().catch(() => undefined), UPDATE_CHECK_MS);
      })
      .catch(() => {
        // Offline support is an enhancement; the site works without it.
      });

    const onVisible = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      container.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    if (notice?.kind !== "offline") return;
    const id = window.setTimeout(() => setNotice((current) => (current?.kind === "offline" ? null : current)), 7000);
    return () => window.clearTimeout(id);
  }, [notice]);

  if (!notice) return null;

  const applyUpdate = () => {
    if (notice.kind !== "update") return;
    refreshing.current = true;
    notice.worker.postMessage("SKIP_WAITING");
  };

  return (
    <div role="status" aria-live="polite" className="lab-toast">
      <p>{notice.kind === "update" ? tpw(lang, "updateAvailable") : tpw(lang, "offlineReady")}</p>
      <div className="lab-toast-actions">
        {notice.kind === "update" && (
          <button type="button" className="lab-toast-primary" onClick={applyUpdate}>
            {tpw(lang, "reload")}
          </button>
        )}
        <button type="button" onClick={() => setNotice(null)}>
          {notice.kind === "update" ? tpw(lang, "later") : tpw(lang, "dismiss")}
        </button>
      </div>
    </div>
  );
}
