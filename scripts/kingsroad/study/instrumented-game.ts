// Type-safe facade. The study builder substitutes an observed copy of game.ts in memory.
// Running without that builder fails the runner's guard rather than emitting empty metrics.
import type { Variant } from "./variant";
export const STUDY_VARIANT: Variant = "baseline";
export const AUDIT_BUILD: boolean = false;
export * from "../../../src/lib/kingsroad/sim/game";
