/**
 * Types partagés du builder de contrat premium.
 * Extraits pour permettre le découpage façade / sous-modules sans cycle.
 */
import type {
  ApprovedChapterOutline,
  CharacterCanon,
  PanelBlueprintPremium,
  ProductionBeat,
  RequiredProp,
  VisualWorldContract,
  buildProductionPlanFromOutline,
} from "@manga-ai-studio/core";
import type { inferNarrativeFactsFromBeat } from "../narrative-fact-extractor";
import type { PremiumReadinessCastContext } from "../panel-blueprint-builder";

export interface BuildPremiumChapterContractInput {
  approvedOutline: ApprovedChapterOutline;
  heroCharacterId: string | null;
  projectGenre: string | null;
  projectTone: string | null;
  recentContinuityEvents?: Array<{
    eventType: string;
    summary: string | null;
    entities?: {
      objectsGained?: string[];
      objectsLost?: string[];
      locationChange?: string;
    };
  }>;
  /**
   * P2.1 — Budget minimum de panels pour ce chapitre. Permet au contrat
   * premium d'honorer le `Chapter.minimumImages` réel (défaut aligné
   * `PRODUCTION_RULES.panelCount.minimum`) plutôt qu'une constante figée.
   */
  minimumPanels?: number;
  chapterId?: string;
  projectId?: string;
  chapterNumber?: number;
  chapterTitle?: string | null;
  projectFormat?: "manga" | "webtoon" | "simple";
  characterDnaHydration?: {
    characters: Array<{
      id: string;
      name: string;
      hairColor?: string | null;
      eyeColor?: string | null;
      appearance?: string | null;
      outfitDefault?: string | null;
    }>;
    characterCanonsById?: Record<string, CharacterCanon> | null;
    characterCanons?: readonly CharacterCanon[] | null;
    /** Si true, n'injecte pas de DNA sans source DB/canon (aligné launch/estimate premium). */
    strict?: boolean;
    /** Héros 2 / co-protagoniste — DNA sur panels avec personnages. */
    coProtagonistCharacterIds?: readonly string[] | null;
  };
  visualWorldContract?: VisualWorldContract | null;
  premiumReadinessCast?: PremiumReadinessCastContext | null;
  knownNpcGroups?: readonly { id: string; label?: string | null }[];
  knownCharacters?: readonly { id: string; name?: string | null; displayName?: string | null }[];
}

export interface ObjectStateFrame {
  beatId: string;
  objectId: string;
  canonicalName: string;
  ownerCharacterId?: string;
  state:
    | "carried"
    | "equipped"
    | "drawn"
    | "used"
    | "thrown"
    | "dropped"
    | "broken"
    | "stored"
    | "visible_on_scene";
  visibility: "required" | "preferred" | "incidental" | "hidden";
}

export interface PremiumMeta {
  premiumReadinessScore: number;
  heroCenterRatio: number;
  cutawayCount: number;
  cutawayRatio: number;
  enemyFocusPanels: number;
  npcPanels: number;
  propCoverage: { covered: string[]; missing: string[] };
  enemyCoverage: { panelCount: number; beatsCovered: string[] };
  npcCoverage: { panelCount: number; avgNpcCount: number };
  cutawayCoverage: { count: number; ratio: number };
  dialogueAnchorCoverage: { anchored: number; floating: number };
  focusDistribution: Record<string, number>;
  shotDistribution: Record<string, number>;
}

export interface BuildPremiumChapterContractResult {
  productionOutline: {
    source: "premium_rebuilt";
    chapterGoal: string;
    cliffhanger: string;
    beats: Array<ProductionBeat & {
      narrativeFacts: ReturnType<typeof inferNarrativeFactsFromBeat>;
      requiredProps: RequiredProp[];
    }>;
  };
  productionPlan: ReturnType<typeof buildProductionPlanFromOutline> & {
    panelBlueprints: PanelBlueprintPremium[];
    focusDistribution: Record<string, number>;
    shotDistribution: Record<string, number>;
    propCoverage: { covered: string[]; missing: string[] };
    enemyCoverage: { panelCount: number; beatsCovered: string[] };
    npcCoverage: { panelCount: number; avgNpcCount: number };
    cutawayCoverage: { count: number; ratio: number };
    dialogueAnchorCoverage: { anchored: number; floating: number };
    heroCenterRatio: number;
    premiumReadinessScore: number;
    objectStateTimeline: ObjectStateFrame[];
  };
  panelBlueprints: PanelBlueprintPremium[];
  objectStateTimeline: ObjectStateFrame[];
  premiumMeta: PremiumMeta;
}

/** Beat enrichi (interne) — `_blueprints` est consommé puis retiré du résultat. */
export interface EnrichedBeatInternal {
  productionBeat: ProductionBeat;
  narrativeFacts: ReturnType<typeof inferNarrativeFactsFromBeat>;
  requiredProps: RequiredProp[];
  blueprints: PanelBlueprintPremium[];
}
