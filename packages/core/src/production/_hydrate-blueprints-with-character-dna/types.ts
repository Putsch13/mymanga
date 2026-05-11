import type { CharacterCanon } from "../../types/chapter-studio";
import type { PanelBlueprintPremium } from "../../types/narrative-facts";

export type CharacterRowForDnaHydration = {
  id: string;
  name: string;
  hairColor?: string | null;
  eyeColor?: string | null;
  appearance?: string | null;
  outfitDefault?: string | null;
  /** JSON studio `Character.stableVisualDNA` — traits configurateur verrouillés. */
  stableVisualDNA?: Record<string, unknown> | null;
  characterFingerprint?: unknown;
  visualProfile?: unknown;
  wardrobeProfile?: unknown;
  bodyState?: unknown;
  continuityProfile?: unknown;
  visualRefs?: unknown;
  visualLocks?: unknown;
  canonPack?: unknown;
  loraAttachments?: unknown;
};

export type HydrateBlueprintsWithCharacterDnaInput = {
  blueprints: PanelBlueprintPremium[];
  characters: CharacterRowForDnaHydration[];
  /** Index par `characterId` (ex. snapshot `data.characterCanons`). */
  characterCanonsById?:
    | ReadonlyMap<string, CharacterCanon>
    | Record<string, CharacterCanon | undefined>
    | null;
  /** Alias liste — converti en map par `characterId`. */
  characterCanons?: readonly CharacterCanon[] | null;
  /**
   * Premium strict : n'injecte pas de ligne `characterVisualDna` sans source DB ou canon ;
   * ajoute une note `character_dna_strict_unresolved:{id}` par ID manquant.
   */
  strict?: boolean;
  /**
   * Héros 2 / co-protagonistes : sur tout panel où au moins un personnage est requis
   * (requis, must-show, ou locuteur `speaker_visible`), on injecte aussi leur DNA pour
   * le preflight strict et les prompts sans exiger que chaque beat liste explicitement le co-héros.
   */
  coProtagonistCharacterIds?: readonly string[] | null;
};
