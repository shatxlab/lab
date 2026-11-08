/** Offline-only experiment selection. Never imported by the shipping application. */
export const VARIANTS = ["baseline", "three-hit", "range-80", "cadence-2x", "matched-2x", "density-only"] as const;
export type Variant = typeof VARIANTS[number];
export function isVariant(value: string): value is Variant {
  return (VARIANTS as readonly string[]).includes(value);
}

/** The entire experimental gameplay delta: retire a bolt immediately after its third distinct hit. */
export function variantSource(source: string, variant: Variant): string {
  if (variant === "baseline" || variant === "range-80" || variant === "cadence-2x" || variant === "matched-2x" || variant === "density-only") return source;
  if (variant !== "three-hit") throw new Error(`Unknown study variant: ${variant}`);
  const anchor = "    shot.hitIds.push(foe.id);";
  if (source.split(anchor).length !== 2) throw new Error("Piercing experiment anchor must occur exactly once");
  return source.replace(anchor, `${anchor}\n    if (shot.hitIds.length >= 3) return false;`);
}

/** Predeclared range-only diagnostic; no outcome-driven parameter search. */
export const STOCK_BALLISTA_RANGES = [140, 150, 165] as const;
export const RANGE_FACTOR = 0.8;
export function expectedRanges(variant: Variant): number[] {
  return STOCK_BALLISTA_RANGES.map(range => variant === "range-80" ? range * RANGE_FACTOR : range);
}
export function variantBalanceSource(source: string, variant: Variant): string {
  if (!isVariant(variant)) throw new Error(`Unknown study variant: ${variant}`);
  if (variant !== "range-80") return source;
  const anchor = "  ballista: {\n";
  if (source.split(anchor).length !== 2) throw new Error("Range experiment block must occur exactly once");
  const start = source.indexOf(anchor), end = source.indexOf("\n  },", start);
  if (end < 0) throw new Error("Range experiment block end missing");
  const block = source.slice(start, end);
  const ranges = [...block.matchAll(/range: (\d+),/g)].map(m => Number(m[1]));
  if (JSON.stringify(ranges) !== JSON.stringify(STOCK_BALLISTA_RANGES)) throw new Error("Range experiment expected exactly the three stock ranges");
  const changed = block.replace(/range: (\d+),/g, (_, range) => `range: ${Number(range) * RANGE_FACTOR},`);
  return source.slice(0, start) + changed + source.slice(end);
}

/** Predeclared cadence diagnostics (spawn spacing only; counts, HP, roads, column gap and tower stats never change). */
export const CADENCE_FACTOR = 2;
export const CADENCE_KINDS = ["runner", "bat", "scamp"] as const;
export const STOCK_CADENCE: Record<(typeof CADENCE_KINDS)[number], number> = { runner: 0.55, bat: 0.45, scamp: 0.2 };
/**
 * cadence-2x: fast kinds x2, nothing else (waves get longer). matched-2x: fast kinds x2 and every slow kind's spacing
 * shrinks by the same per-wave factor, 1 - fastStock/slowStock, so each wave keeps its stock length. density-only: fast
 * kinds stock and the same shrink, a control that separates denser slow columns from fast spacing (waves get shorter).
 */
export const SPACING_ARMS = ["cadence-2x", "matched-2x", "density-only"] as const;
export type SpacingArm = typeof SPACING_ARMS[number];
const SPACING_ARM_RULES: Record<SpacingArm, { fastFactor: number; slowShrink: boolean }> = {
  "cadence-2x": { fastFactor: CADENCE_FACTOR, slowShrink: false },
  "matched-2x": { fastFactor: CADENCE_FACTOR, slowShrink: true },
  "density-only": { fastFactor: 1, slowShrink: true },
};
export function isSpacingArm(value: string): value is SpacingArm {
  return (SPACING_ARMS as readonly string[]).includes(value);
}
export function variantWavesSource(source: string, variant: Variant): string {
  if (!isVariant(variant)) throw new Error(`Unknown study variant: ${variant}`);
  if (!isSpacingArm(variant)) return source;
  const rule = SPACING_ARM_RULES[variant];
  let out = source;
  if (rule.fastFactor !== 1) {
    const anchor = "const SPACING: Record<FoeKind, number> = {\n";
    if (out.split(anchor).length !== 2) throw new Error("Cadence experiment block must occur exactly once");
    const start = out.indexOf(anchor), end = out.indexOf("\n};", start);
    if (end < 0) throw new Error("Cadence experiment block end missing");
    let block = out.slice(start, end);
    for (const kind of CADENCE_KINDS) {
      const pattern = new RegExp(`\\n  ${kind}: (\\d+(?:\\.\\d+)?),`);
      const stock = pattern.exec(block);
      if (!stock || Number(stock[1]) !== STOCK_CADENCE[kind]) throw new Error(`Cadence experiment expected stock ${kind} spacing`);
      block = block.replace(pattern, (_, value) => `\n  ${kind}: ${Number(value) * rule.fastFactor},`);
    }
    out = out.slice(0, start) + block + out.slice(end);
  }
  if (rule.slowShrink) {
    const loopAnchor = "  let at = 0;\n  for (const kind of columns) {\n";
    const spacingAnchor = "      at += SPACING[kind];\n";
    const bossAnchor = "  const footmen = spawns.filter";
    for (const anchor of [loopAnchor, spacingAnchor, bossAnchor]) if (out.split(anchor).length !== 2) throw new Error(`Matched cadence anchor must occur exactly once: ${anchor.trim()}`);
    // Solved so the wave's last spawn (and so its clock, which starts after the last spawn or the warlord) keeps its stock time.
    // With fast spacing x2 (fast kinds total F, slow kinds total S at stock, last column L): fast L: f = 1 + (s_L - F) / S;
    // slow L: f = 1 - F / (S - s_L). The warlord stays at stock time too. density-only reuses the same f with fast stock.
    const inject = [
      "  // Study only: the wave keeps its stock length; slow spacing scales by one factor solved for the last column.",
      "  const STUDY_STOCK_FAST: Partial<Record<FoeKind, number>> = { runner: 0.55, bat: 0.45, scamp: 0.2 };",
      "  const studyFast = columns.reduce((sum, kind) => sum + roster[kind] * (STUDY_STOCK_FAST[kind] ?? 0), 0);",
      "  const studySlow = columns.reduce((sum, kind) => sum + (STUDY_STOCK_FAST[kind] === undefined ? roster[kind] * SPACING[kind] : 0), 0);",
      "  const studyLast = columns[columns.length - 1];",
      "  const studyLastFast = STUDY_STOCK_FAST[studyLast] !== undefined;",
      "  const studyLastStock = studyLastFast ? STUDY_STOCK_FAST[studyLast]! : SPACING[studyLast];",
      "  const studyScale = studyLastFast ? 1 + (studyLastStock - studyFast) / studySlow : 1 - studyFast / (studySlow - studyLastStock);",
      "  if (!(studyScale >= 0.3 && studyScale <= 1.5)) throw new Error(\"Study slow-scale out of range\");",
      "  const studyStockEnd = studyFast + studySlow + COLUMN_GAP * columns.length;",
      "",
    ].join("\n");
    out = out.replace(loopAnchor, inject + loopAnchor);
    out = out.replace(spacingAnchor, "      at += SPACING[kind] * (STUDY_STOCK_FAST[kind] === undefined ? studyScale : 1);\n");
    out = out.replace(bossAnchor, "  at = studyStockEnd;\n" + bossAnchor);
  }
  return out;
}
