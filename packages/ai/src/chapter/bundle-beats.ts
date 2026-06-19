/**
 * bundle-beats.ts
 *
 * Phase 3 du pipeline `generateChapterBundle` : transformation des beats
 * "raw" issus de l'outline en beats finaux (résolution location via Visual
 * World, étirement à `TARGET_PAGES`, vérification anti-répétition).
 *
 * Extrait de `generate-bundle-core.ts` (audit-v9, < 500 lignes/fichier).
 */

import {
  beatLocationSceneStringFromVisualWorld,
  resolveCanonicalLocation,
  sceneStringFromVisualWorldLocation,
  trySelectBeatLocationFromVisualWorld,
  type ApprovedChapterOutline,
  type StructuredBeatPayload,
  type VisualWorldContract,
} from "@manga-ai-studio/core";
import type { PageRole } from "../chapter-outline";
import { analyzeBeatsForRepetition } from "../beat-advancement-checker";
import {
  mergeCharactersFromBeat,
  reinforceIntentEntityCoverage,
  shouldKeepSingleLocation,
  stretchToCount,
} from "./pipeline-helpers";
import type { ProjectContextForChapter } from "./shared-types";

export const PAGE_ROLE_SEQUENCE: PageRole[] = [
  "establishing", "escalation", "confrontation", "escalation",
  "revelation", "aftermath", "escalation", "confrontation",
  "aftermath", "cliffhanger",
];

export type RawOutlineBeat = {
  id: string;
  summary: string;
  tension: number;
  characters: string[];
  location: string;
  purpose: string;
  pageRole: PageRole;
  turn: string;
  emotionalDelta: number;
  structuredBeat?: StructuredBeatPayload;
};

/**
 * Construit les beats "raw" à partir de l'outline + contexte projet + Visual World.
 * Le résultat est ensuite normalisé/étendu par `finalizeBeats`.
 */
export function buildRawOutlineBeats(input: {
  outlineBeats: Array<{
    summary: string;
    emotionalTone?: string;
    pageRole?: PageRole;
    turn?: string;
    emotionalDelta?: number;
    location?: string | null;
    characters: string[];
    structuredBeat?: StructuredBeatPayload;
  }>;
  approvedOutline?: ApprovedChapterOutline | null;
  context: ProjectContextForChapter;
  mainCast: string[];
  visualWorldContract?: VisualWorldContract | null;
  premium: boolean;
  allowLegacyLocationInference?: boolean;
  locA: string | undefined;
  locAt: (i: number) => string | undefined;
}): RawOutlineBeat[] {
  const { mainCast, locA, locAt } = input;
  const vw = input.visualWorldContract;
  const hasVwLocations = Boolean(vw && vw.locations.length > 0);

  return input.outlineBeats.map((beat, index) => {
    const beatKeyForVw = input.approvedOutline?.beats[index]?.id ?? `beat_${index + 1}`;
    return {
      id: `beat_${index + 1}`,
      summary: beat.summary,
      tension: Math.min(9, 2 + index + Math.floor(index / 2)),
      characters: mergeCharactersFromBeat(
        input.context,
        beat.characters,
        beat.summary,
        index % 3 === 0
          ? mainCast.slice(0, Math.min(4, mainCast.length))
          : index % 2 === 0
            ? mainCast.slice(0, Math.min(3, mainCast.length))
            : [
                mainCast[index % mainCast.length] ?? mainCast[0],
                mainCast[(index + 1) % mainCast.length] ?? mainCast[0],
              ].filter(Boolean),
      ),
      location: (() => {
        if (hasVwLocations && vw) {
          if (input.premium && !input.allowLegacyLocationInference) {
            const loc = trySelectBeatLocationFromVisualWorld({ visualWorld: vw, beatId: beatKeyForVw });
            if (loc) return sceneStringFromVisualWorldLocation(loc);
          }
          const scene = beatLocationSceneStringFromVisualWorld(vw, beatKeyForVw);
          if (scene) return scene;
        }
        return (
          resolveCanonicalLocation(input.context.locations ?? [], beat.location?.trim()) ??
          locAt(index === 0 ? 0 : Math.min(index, 1)) ??
          locA ??
          "lieu inconnu"
        );
      })(),
      purpose: beat.emotionalTone ?? `beat_${index + 1}`,
      pageRole: beat.pageRole ?? PAGE_ROLE_SEQUENCE[index % PAGE_ROLE_SEQUENCE.length] ?? "escalation",
      turn: beat.turn ?? beat.summary.slice(0, 80),
      emotionalDelta: beat.emotionalDelta ?? (index % 2 === 0 ? 1 : -1),
      structuredBeat: beat.structuredBeat,
    };
  });
}

/**
 * Étend `rawOutlineBeats` à `TARGET_PAGES`, fusionne single-location si pertinent,
 * applique la réinforcement d'entités et corrige les beats répétitifs détectés.
 */
export async function finalizeBeats(input: {
  rawOutlineBeats: RawOutlineBeat[];
  approvedOutline?: ApprovedChapterOutline | null;
  userIntent: string;
  intentEntityHints: ReturnType<typeof import("../services/entity-brain").parseIntentEntities>;
  context: ProjectContextForChapter;
  mainCast: string[];
  locA: string | undefined;
  locB: string | undefined;
  locAt: (i: number) => string | undefined;
  previousSummary?: string | null;
  previousCliffhanger?: string | null;
}): Promise<RawOutlineBeat[]> {
  const { rawOutlineBeats, mainCast, locA, locB, locAt } = input;

  if (!input.approvedOutline && shouldKeepSingleLocation(input.userIntent, rawOutlineBeats)) {
    const dominantLocation = rawOutlineBeats[0]?.location || locA;
    if (dominantLocation) {
      for (const beat of rawOutlineBeats) beat.location = dominantLocation;
    }
  }

  if (!input.approvedOutline && input.intentEntityHints.length > 0) {
    for (let index = 0; index < Math.min(2, rawOutlineBeats.length); index++) {
      const beat = rawOutlineBeats[index];
      if (!beat) continue;
      beat.characters = [...new Set([...beat.characters, ...input.intentEntityHints.map((entity) => entity.name)])];
    }
  }

  const TARGET_PAGES = input.approvedOutline ? input.approvedOutline.beats.length : 10;
  const dominantLocation = rawOutlineBeats[0]?.location || locA || "lieu inconnu";

  const beats = input.approvedOutline
    ? rawOutlineBeats.slice(0, TARGET_PAGES)
    : (() => {
        const lastBeat = rawOutlineBeats[rawOutlineBeats.length - 1];
        const lastLocation = lastBeat?.location ?? dominantLocation;
        const lastSummaryBase = lastBeat?.summary?.slice(0, 80) ?? input.userIntent.slice(0, 80);
        const STRETCH_PHASES: string[] = [
          `Les conséquences de ${lastSummaryBase} deviennent physiquement visibles autour de ${lastLocation}.`,
          `${mainCast[0] ?? "Le héros"} fait face à un obstacle concret qui bloque sa progression.`,
          `Un personnage secondaire intervient — son action change la dynamique de la scène à ${lastLocation}.`,
          `${mainCast[0] ?? "Le héros"} prend une décision visible : un geste, un mouvement, un choix physique.`,
          `L'environnement réagit : ${lastLocation} se transforme ou révèle un nouvel élément.`,
          `Confrontation directe : ${mainCast[0] ?? "le héros"} et son adversaire se retrouvent face à face.`,
        ];
        return stretchToCount(rawOutlineBeats, TARGET_PAGES, (index) => ({
          id: "beat_" + (index + 1),
          summary: STRETCH_PHASES[index % STRETCH_PHASES.length] ?? STRETCH_PHASES[0]!,
          tension: Math.min(9, 3 + index),
          characters: mainCast.slice(0, Math.min(index % 3 === 0 ? 4 : 3, mainCast.length)),
          location: index % 2 === 0 ? dominantLocation : (locB ?? dominantLocation),
          purpose: "variation_" + (index + 1),
          pageRole: PAGE_ROLE_SEQUENCE[index % PAGE_ROLE_SEQUENCE.length] ?? "escalation",
          turn: "Conséquence directe : la situation évolue de manière irréversible (étape " + (index + 1) + ").",
          emotionalDelta: index % 2 === 0 ? 1 : -1,
          structuredBeat: rawOutlineBeats[Math.max(0, rawOutlineBeats.length - 1)]?.structuredBeat,
        }));
      })();

  if (!input.approvedOutline) {
    reinforceIntentEntityCoverage(beats, input.intentEntityHints);
  }

  if (!input.approvedOutline) {
    const beatAdvancement = await analyzeBeatsForRepetition(
      beats.map((beat) => ({
        id: beat.id,
        summary: beat.summary,
        location: beat.location,
        characters: beat.characters,
        tension: beat.tension,
        purpose: beat.purpose,
      })),
      {
        currentThreads: [
          input.userIntent,
          input.previousCliffhanger ?? "",
          input.previousSummary ?? "",
        ].filter(Boolean),
        characterGoals: Object.fromEntries(
          input.context.characters
            .filter((character) => character.objective)
            .map((character) => [character.name, character.objective ?? ""]),
        ),
      },
    );
    beatAdvancement.results.forEach((result, index) => {
      if (!result.shouldReject) return;
      const beat = beats[index];
      if (!beat) return;
      const fallbackLocation = locAt(index + 1);
      if (index > 0 && beats[index - 1]?.location === beat.location && fallbackLocation && fallbackLocation !== beat.location) {
        beat.location = fallbackLocation;
      }
      beat.summary = `${beat.summary} Nouvelle conséquence concrète : ${result.advancement.whatChanges}.`;
      beat.turn = `${beat.turn} Le lecteur comprend : ${result.advancement.readerLearns}.`;
      beat.purpose = `${beat.purpose} / progression`;
      beat.tension = Math.min(9, beat.tension + 1);
    });
  }

  return beats;
}
