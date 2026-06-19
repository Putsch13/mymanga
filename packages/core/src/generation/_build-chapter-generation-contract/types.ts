import type { ChapterCastContract } from "../../types/chapter-cast-contract";
import type { PanelBlueprintPremium } from "../../types/narrative-facts";
import type { VisualWorldContract } from "../../visual-world/visual-world-contract";

export interface PipelineCharacterLike {
  id: string;
  name: string;
  roleType?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  hairStyle?: string | null;
  skinTone?: string | null;
  outfitSignature?: string | null;
  accessories?: string[] | null;
  bodyType?: string | null;
  ageApparent?: string | null;
  distinctiveMarks?: string[] | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
  canonLocked?: boolean;
  faceRefUrl?: string | null;
  silhouetteRefUrl?: string | null;
  loraUrl?: string | null;
  loraTriggerWord?: string | null;
  loraScale?: number | null;
}

export interface PipelineLocationLike {
  id: string;
  name: string | null;
  visualDescription?: string | null;
}

export interface BuildChapterGenerationContractOutlineBeat {
  id: string;
  summary: string;
  characters?: string[];
  emotionalDelta?: number;
}

export interface BuildChapterGenerationContractInput {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  outlineBeats: BuildChapterGenerationContractOutlineBeat[];
  panelBlueprints: PanelBlueprintPremium[];
  heroCharacterId: string | null;
  focusCharacterIds: string[];
  characters: PipelineCharacterLike[];
  locations: PipelineLocationLike[];
  /**
   * Monde visuel effectif (studio persisté ou pipeline) — P0.11 / P0.13 :
   * remplit `requiredLocationId`, PNJ et créatures par beat / panel.
   */
  visualWorld?: VisualWorldContract | null;
  /**
   * Données pour hasher la provenance (P0.13) — toujours dérivées, jamais « n/a ».
   */
  sourceHashMaterial?: {
    chapterUserIntent?: string | null;
    /** JSON du contrat intention compilé (studio) — prime sur `chapterUserIntent` pour l'empreinte. */
    chapterIntentContractJson?: string | null;
    /** JSON du VisualWorld persisté studio (prioritaire sur l'objet découvert). */
    persistedVisualWorldJson?: string | null;
    /** JSON sérialisé du VisualWorldContract si déjà disponible. */
    visualWorldJson?: string | null;
    /** Objet monde visuel (sérialisé en interne pour l'empreinte). */
    visualWorldObject?: unknown;
    dialogueContractJson?: string | null;
    castContractJson?: string | null;
    castContract?: ChapterCastContract;
  };
}
