/**
 * Construit un StoryArc à partir d'un ProductionPlan approuvé.
 *
 * Objectif : permettre au chemin `approvedPlanDriven` d'utiliser l'IA2
 * (MangaEditorLLM) au lieu de bypasser complètement la passe storyboard.
 *
 * Le StoryArc ainsi construit peut être passé à `runStoryboardPass()` pour
 * obtenir un vrai StoryboardPlan enrichi par LLM.
 */

import type {
  StoryArc,
  StoryBeat,
  StoryBeatType,
  StoryBeatDangerLevel,
} from "@manga-ai-studio/ai";
import type { ContinuityState } from "@manga-ai-studio/ai/contracts";
import type { PanelBlueprintPremium, ProductionOutline } from "@manga-ai-studio/core";

export interface BuildStoryArcFromProductionPlanInput {
  productionPlan: {
    panelBlueprints?: PanelBlueprintPremium[];
    [key: string]: unknown;
  };
  approvedOutline?: ProductionOutline | null;
  chapterId: string;
  chapterNumber: number;
  chapterTitle?: string | null;
  chapterSummary?: string | null;
  chapterUserIntent?: string | null;
  chapterGoal?: string | null;
  cliffhanger?: string | null;
}

function inferBeatTypeFromBlueprints(blueprints: PanelBlueprintPremium[]): StoryBeatType {
  const purposes = blueprints.map((bp) => (bp.purpose ?? "").toLowerCase());
  const joined = purposes.join(" ");

  if (/combat|attack|fight|attaque|battle/.test(joined)) return "combat";
  if (/reveal|découv|secret|shock|surprise/.test(joined)) return "reveal";
  if (/dialogue|speak|parle|dit|conversation/.test(joined)) return "dialogue_tension";
  if (/aftermath|conséquence|résultat|dégât/.test(joined)) return "aftermath";
  if (/transition|travel|déplace|voyage/.test(joined)) return "transition";
  if (/setup|intro|établi|ouverture/.test(joined)) return "setup";
  if (/cliff|suspense|danger|menace/.test(joined)) return "cliffhanger";
  if (/surveil|observe|watch|guet/.test(joined)) return "surveillance";
  if (/infiltr|sneak|furtif/.test(joined)) return "infiltration";

  return "transition";
}

function inferDangerLevelFromBlueprints(blueprints: PanelBlueprintPremium[]): StoryBeatDangerLevel {
  const purposes = blueprints.map((bp) => (bp.purpose ?? "").toLowerCase()).join(" ");

  if (/critical|mort|death|grave|fatal/.test(purposes)) return "critical";
  if (/combat|attack|fight|danger|menace|threat/.test(purposes)) return "high";
  if (/tension|suspense|conflict|conflit/.test(purposes)) return "medium";
  return "low";
}

function extractCharactersFromBlueprints(blueprints: PanelBlueprintPremium[]): string[] {
  const chars = new Set<string>();
  for (const bp of blueprints) {
    if (bp.requiredEntityIds) {
      for (const id of bp.requiredEntityIds) {
        chars.add(id);
      }
    }
  }
  return Array.from(chars);
}

function extractLocationFromBlueprints(blueprints: PanelBlueprintPremium[]): string {
  for (const bp of blueprints) {
    const signals = bp.requiredLocationSignals ?? [];
    if (signals.length > 0) {
      return signals.filter(Boolean).join(", ");
    }
  }
  return "unknown_location";
}

function createEmptyContinuityState(): ContinuityState {
  return {
    worldTime: null,
    activeCharacters: [],
    knownLocations: [],
    unresolvedThreads: [],
    activeItems: [],
    lastKnownEvents: [],
  };
}

export function buildStoryArcFromProductionPlan(
  input: BuildStoryArcFromProductionPlanInput,
): StoryArc {
  const blueprints = input.productionPlan.panelBlueprints ?? [];
  const outline = input.approvedOutline;

  const beatIdToBlueprints = new Map<string, PanelBlueprintPremium[]>();
  for (const bp of blueprints) {
    const beatId = bp.beatId ?? "unknown";
    if (!beatIdToBlueprints.has(beatId)) {
      beatIdToBlueprints.set(beatId, []);
    }
    beatIdToBlueprints.get(beatId)!.push(bp);
  }

  const beats: StoryBeat[] = [];
  let order = 0;

  const outlineBeats = outline?.beats ?? [];
  const outlineBeatMap = new Map(outlineBeats.map((b) => [b.beatId, b]));

  for (const [beatId, bps] of beatIdToBlueprints) {
    order += 1;
    const outlineBeat = outlineBeatMap.get(beatId);

    const storyEvent = outlineBeat?.summary
      ?? bps[0]?.purpose
      ?? `Beat ${order} events`;

    const beat: StoryBeat = {
      beatId,
      order,
      type: inferBeatTypeFromBlueprints(bps),
      purpose: outlineBeat?.whyThisBeatExists ?? storyEvent,
      storyEvent,
      locationId: null,
      locationName: extractLocationFromBlueprints(bps),
      charactersPresent: outlineBeat?.involvedCharacters ?? extractCharactersFromBlueprints(bps),
      emotionalTurn: outlineBeat?.dramaticChange ?? "progression",
      dialogueIntent: null,
      mustReveal: [],
      mustPreserve: outlineBeat?.activeCanonConstraints ?? [],
      mustNotInvent: [],
      dangerLevel: inferDangerLevelFromBlueprints(bps),
      continuityEffects: {
        stateChanges: [],
        itemsIntroduced: [],
        informationLearned: [],
      },
    };

    beats.push(beat);
  }

  if (beats.length === 0) {
    beats.push({
      beatId: "beat_1",
      order: 1,
      type: "setup",
      purpose: "Chapter opening",
      storyEvent: input.chapterSummary ?? "Chapter begins",
      locationId: null,
      locationName: "unknown_location",
      charactersPresent: [],
      emotionalTurn: "neutral",
      dialogueIntent: null,
      mustReveal: [],
      mustPreserve: [],
      mustNotInvent: [],
      dangerLevel: "low",
      continuityEffects: {
        stateChanges: [],
        itemsIntroduced: [],
        informationLearned: [],
      },
    });
  }

  return {
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    title: input.chapterTitle ?? `Chapter ${input.chapterNumber}`,
    summary: input.chapterSummary ?? input.chapterUserIntent ?? "",
    chapterGoal: input.chapterGoal ?? outline?.chapterGoal ?? "Progress the story",
    cliffhanger: input.cliffhanger ?? outline?.cliffhanger ?? "",
    continuityBefore: createEmptyContinuityState(),
    continuityAfter: createEmptyContinuityState(),
    beats,
  };
}
