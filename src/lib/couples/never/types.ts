export const NEVER_CATEGORIES = ["light", "stories", "closer"] as const;
export type NeverCategory = typeof NEVER_CATEGORIES[number];
export interface NeverCard {
  id: string;
  category: NeverCategory;
  prompt: string;
  followUp: string;
}
export type NeverDeck = "mix" | NeverCategory;
export type NeverAnswer = "have" | "never";
