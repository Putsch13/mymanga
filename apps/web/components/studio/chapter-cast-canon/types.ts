/**
 * Types partagés des sous-composants du step Cast & Canon.
 */
export type CharacterCatalogEntry = {
  id: string;
  name: string;
  roleType?: string | null;
  imageUrl?: string | null;
};

export type RecurringNpc = {
  stableNpcId: string;
  label: string;
  shortVisualCore: string;
  appearanceCount: number;
  isPromotedToCharacter: boolean;
};

export type ResolvedNpc = {
  label: string;
  promptFragment: string;
  narrativeHook: string;
  strategy: string;
};

export type NpcRow = {
  source: "draft" | "session";
  id: string;
  label: string;
  promptFragment: string;
  narrativeHook: string;
  strategy: string;
};
