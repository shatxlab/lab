import { useId } from "react";
import { tileColor, tileShape, type Tile } from "@/lib/couples/mini-games";

/** Sculpted tokens, not font glyphs: identical geometry across devices. */
export function PatternToken({ tile }: { tile: Tile }) {
  const id = useId().replace(/:/g, "");
  if (!tile) return <span className="cp-pattern-empty" aria-hidden="true">·</span>;
  const colors = [ ["#99f6e4", "#0d9488", "#115e59"], ["#fed7aa", "#f97316", "#9a3412"], ["#e9d5ff", "#a855f7", "#6b21a8"], ["#fbcfe8", "#ec4899", "#9d174d"] ];
  const [light, mid, dark] = colors[tileColor(tile)];
  const shape = tileShape(tile);
  return <svg className="cp-pattern-token" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0.8" y2="1"><stop stopColor={light}/><stop offset=".48" stopColor={mid}/><stop offset="1" stopColor={dark}/></linearGradient></defs>
    <g fill={`url(#${id})`} stroke={dark} strokeWidth="1.5" strokeLinejoin="round">
      {shape === 0 ? <circle cx="32" cy="32" r="23"/> : shape === 1 ? <path d="M28.5 10 Q32 4 35.5 10 L58 49 Q61 55 54 55 H10 Q3 55 6 49 Z"/> : <rect x="10" y="10" width="44" height="44" rx="10"/>}
    </g>
    <path d={shape === 0 ? "M17 27 Q21 14 36 15" : shape === 1 ? "M17 43 L30 20" : "M17 29 V23 Q17 17 23 17 H37"} fill="none" stroke="white" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round"/>
  </svg>;
}
