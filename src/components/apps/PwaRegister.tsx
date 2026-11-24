import * as React from "react";

import { tpw } from "@/lib/apps/pwa-i18n";
import { withBase } from "@/lib/apps/paths";
import { bootStorageMirror } from "@/lib/apps/storage-mirror";
import { useAppLang } from "@/lib/apps/use-app-lang";

/** How often an open tab asks the server whether a newer worker exists. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

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

  // Persisted-storage grant plus restore of evicted saves. `bootStorageMirror`
  // is memoized: the layout's head script usually runs it first — this effect
  // is the fallback for pages without the script.
  React.useEffect(() => {
    bootStorageMirror();
  }, []);

  React.useEffect(() => {
    if (!import.meta.env.PROD || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    let registration: ServiceWorkerRegistration | undefined;
    let timer: number | undefined;

    // No timer-based reload here on purpose: if the waiting worker never takes
    // over, a reload would load the same page and post SKIP_WAITING again, which
    // reloads again, every few seconds. Reloading only on `controllerchange`
    // means a takeover really happened, and the next page has no waiting worker.
    const applyUpdate = (worker: ServiceWorker) => {
      if (refreshing.current) return;
      refreshing.current = true;
      worker.postMessage("SKIP_WAITING");
    };

    const onControllerChange = () => {
      // Only reload for an update we started, not the first-install claim.
      if (refreshing.current) window.location.reload();
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
