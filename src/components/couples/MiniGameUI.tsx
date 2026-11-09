import { useEffect, useRef } from "react";
import { miniStrings, miniText } from "@/lib/couples/mini-games";
import type { Lang } from "@/lib/couples/types";

export interface MiniPlayProps {
  lang: Lang;
  names: [string, string];
  onReplay(): void;
  onMenu(): void;
}

/** Only a neutral cover is mounted during a handoff; private boards/choices aren't in the DOM. */
export function MiniHandoff({ lang, name, onReady }: { lang: Lang; name: string; onReady(): void }) {
  const T = miniStrings(lang);
  return <section className="cp-mini-panel cp-mini-handoff" data-handoff="">
    <span className="cp-pass-emoji" aria-hidden="true">🤲</span>
    <h2 tabIndex={-1}>{T.pass}</h2>
    <p>{miniText(T.lookAway, { name })}</p>
    <button type="button" className="cp-primary" onClick={onReady}>{miniText(T.ready, { name })}</button>
  </section>;
}

export function MiniResultsActions({ lang, onReplay, onMenu }: Pick<MiniPlayProps, "lang" | "onReplay" | "onMenu">) {
  const T = miniStrings(lang);
  return <div className="cp-mini-actions">
    <button type="button" className="cp-primary" data-action="replay" onClick={onReplay}>{T.again}</button>
    <button type="button" className="cp-secondary" data-action="menu" onClick={onMenu}>{T.menu}</button>
  </div>;
}

export function useMiniPhaseFocus(phase: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    const scroll = ref.current?.closest(".cp-mini-scroll");
    if (scroll) scroll.scrollTop = 0;
  }, [phase]);
  return ref;
}
