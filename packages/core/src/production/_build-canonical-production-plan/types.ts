import type { ChapterFormat } from "../production-rules";
import type { RhythmConfig } from "../panel-rhythm-planner";

export interface BuildCanonicalPlanInput {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  chapterTitle: string;
  format: ChapterFormat;
  rawOutline: unknown;
  rhythmConfig?: Partial<RhythmConfig>;
  /** NPC groups connus du projet : les refs qui matchent sont retirées
   *  de `unresolvedCharacterRefs` pour éviter les faux QA fail. */
  knownNpcGroups?: readonly { id: string; label?: string | null }[];
  /** Catalogue personnages du projet : complète la résolution. */
  knownCharacters?: readonly {
    id: string;
    name?: string | null;
    displayName?: string | null;
  }[];
  /** VisualWorldContract — used to allocate contractual slots (props, NPCs)
   *  before the generic rhythm pass. */
  visualWorld?: {
    props?: ReadonlyArray<{
      id: string;
      visibilityPolicy?: string | null;
      continuityPolicy?: string;
      requiredBeatIds?: string[];
    }>;
    npcGroups?: ReadonlyArray<{
      id: string;
      requiredBeatIds?: string[];
    }>;
    beatBindings?: ReadonlyArray<{
      beatId: string;
      primaryPropIds?: string[];
      npcGroupIds?: string[];
      locationId?: string | null;
    }>;
    locations?: ReadonlyArray<{ id: string }>;
  } | null;
}
