import type { PassiveId, WeaponId } from "./types";

export const CLASS_IDS = ["fieldRep", "compliance", "systems"] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const SHARED_PASSIVES = ["coffee", "gym", "sneakers", "mentor"] as const;
export const CLASSES: Record<ClassId, { weapons: readonly WeaponId[]; passives: readonly PassiveId[] }> = {
  fieldRep: { weapons: ["businessCard", "spreadsheet", "rubberDuck"], passives: ["powerTie", "lanyard"] },
  compliance: { weapons: ["policyBinder", "contract", "rubberDuck"], passives: ["ergoChair", "lanyard"] },
  systems: { weapons: ["serverRack", "spreadsheet", "contract"], passives: ["powerTie", "ergoChair"] },
};

export const CLASS_CORE: Record<ClassId, WeaponId> = {
  fieldRep: "businessCard", compliance: "policyBinder", systems: "serverRack",
};

export function isClassId(id: unknown): id is ClassId {
  return CLASS_IDS.some((entry) => entry === id);
}

export function classWeapons(id: ClassId, signature: WeaponId): WeaponId[] {
  return [...new Set([signature, ...CLASSES[id].weapons])];
}

export function classPassives(id: ClassId): PassiveId[] {
  return [...SHARED_PASSIVES, ...CLASSES[id].passives];
}
