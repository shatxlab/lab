import type { CSSProperties } from 'react'

/** React's style prop is an object; this helper types the CSS custom properties the game CSS reads (e.g. `--c`). */
export function cssVars(vars: Record<string, string>): CSSProperties {
  return vars as unknown as CSSProperties
}
