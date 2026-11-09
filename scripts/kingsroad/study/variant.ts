/** Offline-only experiment selection. Never imported by the shipping application. */
export const VARIANTS = ["baseline", "three-hit", "range-80", "cadence-2x", "matched-2x", "density-only", "roster-spread", "bulwark"] as const;
export type Variant = typeof VARIANTS[number];
export function isVariant(value: string): value is Variant {
  return (VARIANTS as readonly string[]).includes(value);
}

/** The entire experimental gameplay delta: retire a bolt immediately after its third distinct hit. */
export function variantSource(source: string, variant: Variant): string {
  if (!isVariant(variant)) throw new Error(`Unknown study variant: ${variant}`);
  if (variant === "bulwark") {
    const anchor = "  const raw = fire && def.fireproof ? damage * FIREPROOF_HIT : damage;\n";
    if (source.split(anchor).length !== 2) throw new Error("Bulwark experiment anchor must occur exactly once");
    return source.replace(anchor, "  const base = fire && def.fireproof ? damage * FIREPROOF_HIT : damage;\n  // Study only: a bulwark's tower shield caps any one blow; burning ticks are not blows.\n  const raw = Math.min(base, def.hitCap ?? Infinity);\n");
  }
  if (variant !== "three-hit") return source;
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

/** Predeclared roster-distribution diagnostic: the fast ground swarms (scamp, runner) split round-robin across the map's roads within their column. Same foes, counts, spawn times and RNG draws; only the road field changes, so single-road maps are untouched. */
export const SPREAD_KINDS = ["scamp", "runner"] as const;
export function variantRosterSource(source: string, variant: Variant): string {
  if (!isVariant(variant)) throw new Error(`Unknown study variant: ${variant}`);
  if (variant !== "roster-spread") return source;
  const anchor = "      spawns.push({ kind, at, road });\n";
  if (source.split(anchor).length !== 2) throw new Error("Roster experiment anchor must occur exactly once");
  return source.replace(anchor, `      spawns.push({ kind, at, road: ["scamp", "runner"].includes(kind) ? (road + count) % map.roads.length : road });\n`);
}

/** Predeclared shielded-foe prototype: the bulwark's tower shield caps any single hit. Forced onto all 20 maps, harsher than any shipping plan. */
// v1 (fromWave 6, every 4) was measured too punitive: Ballista-heavy 160->108 with four late maps at 0/8.
// v2 is a single predeclared dose change: rarer, same foe and cap.
export const BULWARK = { hp: 90, speed: 26, leak: 2, gold: 14, radius: 11, hitCap: 12, fromWave: 8, every: 6, spacing: 1.6 } as const;
export function variantTypesSource(source: string, variant: Variant): string {
  if (!isVariant(variant)) throw new Error(`Unknown study variant: ${variant}`);
  if (variant !== "bulwark") return source;
  const anchor = 'export type NewFoeKind = "knight" | "imp" | "healer" | "scamp" | "gargoyle";\n';
  if (source.split(anchor).length !== 2) throw new Error("Bulwark type anchor must occur exactly once");
  return source.replace(anchor, 'export type NewFoeKind = "knight" | "imp" | "healer" | "scamp" | "gargoyle" | "bulwark";\n');
}
export function variantBulwarkBalanceSource(source: string, variant: Variant): string {
  if (!isVariant(variant)) throw new Error(`Unknown study variant: ${variant}`);
  if (variant !== "bulwark") return source;
  const fieldAnchor = "  fireproof: boolean;\n";
  if (source.split(fieldAnchor).length !== 2) throw new Error("Bulwark balance field anchor must occur exactly once");
  let out = source.replace(fieldAnchor, fieldAnchor + "  /** Study only: the most any single hit counts for. */\n  hitCap?: number;\n");
  const foeAnchor = '  gargoyle: foe({ hp: 140, speed: 28, leak: 3, gold: 16, radius: 11, flying: true, armor: 2, color: "#7d8591" }),\n';
  if (out.split(foeAnchor).length !== 2) throw new Error("Bulwark balance foe anchor must occur exactly once");
  return out.replace(foeAnchor, foeAnchor + `  // Study only: wall-bearer behind a tower shield; no single blow counts for much.\n  bulwark: foe({ hp: ${BULWARK.hp}, speed: ${BULWARK.speed}, leak: ${BULWARK.leak}, gold: ${BULWARK.gold}, radius: ${BULWARK.radius}, color: "#4f5d6e", hitCap: ${BULWARK.hitCap} }),\n`);
}
export function variantBulwarkWavesSource(source: string, variant: Variant): string {
  if (!isVariant(variant)) throw new Error(`Unknown study variant: ${variant}`);
  if (variant !== "bulwark") return source;
  const rosterAnchor = '    gargoyle: sends("gargoyle", wave >= 8 && wave % 4 === 0 ? 1 + Math.floor((wave - 8) / 6) : 0),\n';
  const columnsAnchor = '(["grunt", "runner", "brute", "bat", "knight", "imp", "scamp", "gargoyle"] as const)';
  const spacingAnchor = "  gargoyle: 1.2,\n";
  for (const anchor of [rosterAnchor, columnsAnchor, spacingAnchor]) if (source.split(anchor).length !== 2) throw new Error("Bulwark waves anchor must occur exactly once");
  let out = source.replace(rosterAnchor, rosterAnchor + `    // Study only: forced onto every map, harsher than shipping.\n    bulwark: wave >= ${BULWARK.fromWave} ? 1 + Math.floor((wave - ${BULWARK.fromWave}) / ${BULWARK.every}) : 0,\n`);
  out = out.replace(columnsAnchor, '(["grunt", "runner", "brute", "bat", "knight", "imp", "scamp", "gargoyle", "bulwark"] as const)');
  return out.replace(spacingAnchor, spacingAnchor + `  bulwark: ${BULWARK.spacing},\n`);
}
