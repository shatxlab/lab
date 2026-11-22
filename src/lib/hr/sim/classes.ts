import type { PassiveId, WeaponId } from "./types";

export const CLASS_IDS = ["fieldRep", "compliance", "systems"] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** The four everyone can earn from promotions; each class adds exactly one of its own on top. */
export const SHARED_PASSIVES = ["coffee", "gym", "sneakers", "mentor"] as const;

/**
 * One weapon pool and one class passive per class, with nothing shared between tracks (besides the Intern's
 * automatic Sticky Notes): the six other weapons and the three other passives are split exactly once.
 */
export const CLASSES: Record<ClassId, { weapons: readonly WeaponId[]; passives: readonly PassiveId[] }> = {
  fieldRep: { weapons: ["businessCard", "spreadsheet"], passives: ["powerTie"] },
  compliance: { weapons: ["policyBinder", "rubberDuck"], passives: ["ergoChair"] },
  systems: { weapons: ["serverRack", "contract"], passives: ["lanyard"] },
};

/** The one weapon a class offer always seeds before it is owned. */
export const CLASS_CORE: Record<ClassId, WeaponId> = {
  fieldRep: "businessCard", compliance: "policyBinder", systems: "serverRack",
};

export function isClassId(id: unknown): id is ClassId {
  return CLASS_IDS.some((entry) => entry === id);
}

export function classWeapons(id: ClassId, signature: WeaponId): WeaponId[] {
  return [...new Set([signature, ...CLASSES[id].weapons])];
}

/** The passives a class day can offer: the shared four, then the class's own. */
export function classPassives(id: ClassId): PassiveId[] {
  return [...SHARED_PASSIVES, ...CLASSES[id].passives];
}

/** The class's exclusive passive. */
export function classPassive(id: ClassId): PassiveId {
  return CLASSES[id].passives[0];
}
