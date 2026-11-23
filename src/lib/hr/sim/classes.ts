import type { PassiveId, WeaponId } from "./types";

export const CLASS_IDS = ["fieldRep", "compliance", "systems"] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** The four everyone can earn from promotions; each class adds exactly one of its own on top. */
export const SHARED_PASSIVES = ["coffee", "gym", "sneakers", "mentor"] as const;

/**
 * One default weapon, one rest-of-pool and one class passive per class, with nothing shared between tracks. The
 * default (signature) weapon is equipped at the start of every class day and is unique per class; the rest of the
 * pool is picked up during runs, so every weapon belongs to exactly one class.
 */
export const CLASSES: Record<ClassId, { signature: WeaponId; weapons: readonly WeaponId[]; passives: readonly PassiveId[] }> = {
  fieldRep: { signature: "businessCard", weapons: ["spreadsheet"], passives: ["powerTie"] },
  compliance: { signature: "stickyNotes", weapons: ["policyBinder", "rubberDuck"], passives: ["ergoChair"] },
  systems: { signature: "serverRack", weapons: ["contract"], passives: ["lanyard"] },
};

/** The class's default weapon: unique per class, equipped before the first offer. */
export function classSignature(id: ClassId): WeaponId {
  return CLASSES[id].signature;
}

/** Everything a class day can offer as a weapon: the default first, then the rest of the pool. */
export function classWeapons(id: ClassId): WeaponId[] {
  return [CLASSES[id].signature, ...CLASSES[id].weapons];
}

/** The passives a class day can offer: the shared four, then the class's own. */
export function classPassives(id: ClassId): PassiveId[] {
  return [...SHARED_PASSIVES, ...CLASSES[id].passives];
}

/** The class's exclusive passive. */
export function classPassive(id: ClassId): PassiveId {
  return CLASSES[id].passives[0];
}

export function isClassId(id: unknown): id is ClassId {
  return CLASS_IDS.some((entry) => entry === id);
}
