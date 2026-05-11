/**
 * P2.1 — Usecase : compiler l’intention chapitre en `ChapterIntentContract`.
 *
 * S’appuie sur `lib/chapter-intent/compile-chapter-intent` (déjà testé) et
 * encapsule la concaténation `rawUserIntent` que la route API faisait
 * inline. Sortie sérialisable, prête à renvoyer côté Next.
 */

import {
  type ChapterIntentContract,
  buildIntentNarrativeContract,
  type IntentNarrativeContract,
  type KnownCharacterRef,
  logIntentContract,
} from "@manga-ai-studio/core";
import {
  compileChapterIntent,
  type CompileChapterIntentInput as RawInput,
} from "@/lib/chapter-intent/compile-chapter-intent";
import type { Usecase } from "./types";
import { UsecaseFailure } from "./types";

export type CompileChapterIntentUsecaseInput = {
  rawUserIntent?: string;
  shortPitch?: string;
  mustHappen?: string;
  mustNot?: string;
  wish?: string;
  pacing?: "slow" | "balanced" | "fast";
  dialogueLevel?: "low" | "medium" | "high";
  endingType?: string;
  chapterId?: string;
  /** @deprecated Use `knownCharacters` instead (FIX-12). */
  knownCharacterNames?: string[];
  /**
   * FIX-12 — Cast projet (id + name + roleType) pour la résolution de
   * pronoms ("lui", "elle", "son frère"…). Préféré aux arrays parallèles
   * legacy qui posaient des risques de désync d'index.
   */
  knownCharacters?: ReadonlyArray<KnownCharacterRef>;
  /**
   * FIX-12 — IDs des personnages explicitement sélectionnés pour CE
   * chapitre. Scope la résolution de pronoms à ce sous-ensemble.
   */
  selectedCharacterIds?: ReadonlyArray<string>;
  knownLocationNames?: string[];
};

export type CompileChapterIntentUsecaseOutput = {
  contract: ChapterIntentContract;
  /** Narrative intent contract (Sprint 1) — required events, NPC groups, locations. */
  narrativeContract: IntentNarrativeContract | null;
  /** `true` si l’IA est intervenue (heuristique sinon). */
  usedAi: boolean;
};

const MIN_RAW_LENGTH = 8;

/**
 * Concatène les champs studio (pitch, must, wish…) en une intention brute
 * comme la route le faisait, mais de façon partagée et testable.
 */
export function buildRawUserIntent(input: CompileChapterIntentUsecaseInput): string {
  const explicit = typeof input.rawUserIntent === "string" ? input.rawUserIntent.trim() : "";
  if (explicit.length > 0) return explicit;
  return [
    input.shortPitch?.trim(),
    input.mustHappen?.trim(),
    input.mustNot?.trim(),
    input.wish?.trim(),
    input.endingType?.trim(),
  ]
    .filter((s): s is string => Boolean(s))
    .join("\n\n");
}

export const compileChapterIntentUsecase: Usecase<
  CompileChapterIntentUsecaseInput,
  CompileChapterIntentUsecaseOutput
> = {
  name: "compileChapterIntent",
  async execute(input) {
    const rawUserIntent = buildRawUserIntent(input);
    if (rawUserIntent.length < MIN_RAW_LENGTH) {
      throw new UsecaseFailure({
        code: "INTENT_RAW_TOO_SHORT",
        message: `Décris ton intention en au moins une phrase (${MIN_RAW_LENGTH} caractères minimum).`,
      });
    }

    const before = process.env.OPENAI_API_KEY?.trim();
    const usedAi = Boolean(before);

    const payload: RawInput = {
      rawUserIntent,
      shortPitch: input.shortPitch,
      mustHappen: input.mustHappen,
      mustNot: input.mustNot,
      wish: input.wish,
      pacing: input.pacing,
      dialogueLevel: input.dialogueLevel,
      endingType: input.endingType,
    };

    const contract = await compileChapterIntent(payload);

    let narrativeContract: IntentNarrativeContract | null = null;
    if (input.chapterId) {
      try {
        narrativeContract = buildIntentNarrativeContract({
          chapterId: input.chapterId,
          userIntent: rawUserIntent,
          // FIX-12 — On privilégie le format unifié `knownCharacters`
          // mais on reste compatible avec l'ancien `knownCharacterNames`.
          knownCharacters: input.knownCharacters ?? [],
          knownCharacterNames: input.knownCharacterNames ?? [],
          knownLocationNames: input.knownLocationNames ?? [],
          selectedCharacterIds: input.selectedCharacterIds ?? [],
        });
        logIntentContract({
          requiredEvents: narrativeContract.requiredEvents.length,
          requiredNpcGroups: narrativeContract.requiredNpcGroups.length,
          requiredLocations: narrativeContract.requiredLocations.length,
          eventIds: narrativeContract.requiredEvents.map((e) => e.id),
        });
      } catch (err) {
        console.warn("[compile-chapter-intent] narrative_contract_build_failed", err);
      }
    }

    return { contract, narrativeContract, usedAi };
  },
};
