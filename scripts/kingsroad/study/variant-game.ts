// Unobserved control for the selected offline variant, including counterfactual continuations.
// The study builder replaces this facade in memory; ordinary imports remain the shipping baseline.
import type { Variant } from "./variant";
export const STUDY_VARIANT: Variant = "baseline";
export * from "../../../src/lib/kingsroad/sim/game";
