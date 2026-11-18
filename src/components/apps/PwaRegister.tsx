import * as React from "react";

import { tpw } from "@/lib/apps/pwa-i18n";
import { withBase } from "@/lib/apps/paths";
import { useAppLang } from "@/lib/apps/use-app-lang";

/** How often an open tab asks the server whether a newer worker exists. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** If `controllerchange` never arrives after `skipWaiting`, reload anyway. */
const RELOAD_FALLBACK_MS = 3000;

/**
 * Registers the service worker (production only). The first install is
 * announced as offline-ready; after that a new deploy is applied the moment
 * it has downloaded — `SKIP_WAITING`, then reload as soon as the new worker
 * takes over, so the page is never half old / half new and no prompt is shown.
 */
export default function PwaRegister() {
  const lang = useAppLang();
  const [notice, setNotice] = React.useState<boolean>(false);
  const refreshing = React.useRef(false);
  const reloadTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;
    let timer: number | undefined;

    const applyUpdate = (worker: ServiceWorker) => {
      if (refreshing.current) return;
      refreshing.current = true;
      worker.postMessage("SKIP_WAITING");
      // A slow or broken worker must not leave the tab stranded on the old version.
      reloadTimer.current = window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
    };

    const onControllerChange = () => {
      // Only reload for an update we started, not the first-install claim.
      if (!refreshing.current) return;
      if (reloadTimer.current !== undefined) window.clearTimeout(reloadTimer.current);
      window.location.reload();
    };
    container.addEventListener("controllerchange", onControllerChange);

    const watch = (worker: ServiceWorker) => {
      worker.addEventListener("statechange", () => {
        if (worker.state !== "installed") return;
        // A controller already exists → this is an update; otherwise it is the first install.
        if (container.controller) applyUpdate(worker);
        else setNotice(true);
      });
    };

    container
      .register(withBase("/sw.js"), { scope: withBase("/") + (withBase("/").endsWith("/") ? "" : "/") })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && container.controller) applyUpdate(reg.waiting);
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
      if (reloadTimer.current !== undefined) window.clearTimeout(reloadTimer.current);
      if (timer) window.clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(false), 7000);
    return () => window.clearTimeout(id);
  }, [notice]);

  if (!notice) return null;

  return (
    <div role="status" aria-live="polite" className="lab-toast">
      <p>{tpw(lang, "offlineReady")}</p>
      <div className="lab-toast-actions">
        <button type="button" onClick={() => setNotice(false)}>
          {tpw(lang, "dismiss")}
        </button>
      </div>
    </div>
  );
}
