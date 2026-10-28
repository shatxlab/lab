import { appearanceFor, SHIRT_RAMPS, type Appearance } from "@/lib/tycoon/render-support/characters";

import { DEPARTMENTS } from "./data";
import type { DepartmentId } from "./types";

/** A coworker's look: sprite and hair from their id, as in Tycoon; the shirt in their department's colour. */
export function rosterAppearance(id: number, department: DepartmentId): Appearance {
  const shirt = SHIRT_RAMPS.findIndex((ramp) => ramp.name === DEPARTMENTS[department].shirt) + 1;
  return { ...appearanceFor(id), shirt };
}
