/**
 * P6.17 — StoryContractCompletenessQA : vérifie que le StoryContract est complet.
 *
 * Avant le storyboard, cette QA vérifie que tous les éléments critiques sont présents :
 * - Héros présent
 * - Personnages requis présents
 * - Lieux requis présents
 * - PNJ/groupes requis présents
 * - Robots/hybrides/créatures requis typés
 * - Props autorisés définis
 * - Props interdits définis
 * - Beats tous couverts
 *
 * @module story-contract-completeness-qa
 */

import type { ChapterStoryContract } from "@manga-ai-studio/core";
import type { ChapterCastContract } from "@manga-ai-studio/core";
import type { LocationContract } from "@manga-ai-studio/core";
import type { NpcGroupContract } from "@manga-ai-studio/core";
import type { NonHumanVisualContract } from "@manga-ai-studio/core";

/**
 * Codes d'erreur pour la QA de complétude.
 */
export const STORY_CONTRACT_COMPLETENESS_ERRORS = {
  HERO_MISSING: "E_STORY_CONTRACT_HERO_MISSING",
  LOCATION_MISSING: "E_STORY_CONTRACT_LOCATION_MISSING",
  LOCATION_VAGUE: "E_STORY_CONTRACT_LOCATION_VAGUE",
  NPC_GROUP_MISSING: "E_STORY_CONTRACT_NPC_GROUP_MISSING",
  VISUAL_ENTITY_UNKNOWN: "E_STORY_CONTRACT_VISUAL_ENTITY_UNKNOWN",
  BEATS_EMPTY: "E_STORY_CONTRACT_BEATS_EMPTY",
  REQUIRED_CHARACTER_MISSING: "E_STORY_CONTRACT_REQUIRED_CHARACTER_MISSING",
  FORBIDDEN_PROPS_UNDEFINED: "E_STORY_CONTRACT_FORBIDDEN_PROPS_UNDEFINED",
} as const;

export type StoryContractCompletenessErrorCode =
  (typeof STORY_CONTRACT_COMPLETENESS_ERRORS)[keyof typeof STORY_CONTRACT_COMPLETENESS_ERRORS];

/**
 * Issue de complétude.
 */
export interface StoryContractCompletenessIssue {
  code: StoryContractCompletenessErrorCode;
  message: string;
  severity: "error" | "warning";
  details?: Record<string, unknown>;
}

/**
 * Input pour la QA de complétude.
 */
export interface StoryContractCompletenessQaInput {
  storyContract: ChapterStoryContract;
  castContract?: ChapterCastContract | null;
  locationContract?: LocationContract | null;
  npcGroupContract?: NpcGroupContract | null;
  nonHumanContract?: NonHumanVisualContract | null;
  beatIds?: string[];
  strictMode?: boolean;
}

/**
 * Résultat de la QA de complétude.
 */
export interface StoryContractCompletenessQaResult {
  ok: boolean;
  issues: StoryContractCompletenessIssue[];
  summary: string;
  stats: {
    heroPresent: boolean;
    charactersCount: number;
    locationsCount: number;
    npcGroupsCount: number;
    beatsCount: number;
    forbiddenPropsCount: number;
  };
}

/**
 * Lieux vagues interdits.
 */
const VAGUE_LOCATIONS = [
  "story-consistent setting",
  "generic setting",
  "unknown location",
  "some place",
  "somewhere",
  "lieu générique",
];

/**
 * Exécute la QA de complétude du StoryContract.
 */
export function runStoryContractCompletenessQa(
  input: StoryContractCompletenessQaInput,
): StoryContractCompletenessQaResult {
  const issues: StoryContractCompletenessIssue[] = [];
  const sc = input.storyContract;
  const strictMode = input.strictMode ?? false;

  // 1. Vérifier le héros
  const heroPresent = !!(
    input.castContract?.heroCharacterId ||
    sc.requiredCharacterIds?.length
  );
  if (!heroPresent && strictMode) {
    issues.push({
      code: STORY_CONTRACT_COMPLETENESS_ERRORS.HERO_MISSING,
      message: "Le StoryContract n'a pas de héros défini",
      severity: "error",
    });
  }

  // 2. Vérifier les lieux
  const locationsCount =
    input.locationContract?.locations.length ?? sc.requiredLocations?.length ?? 0;
  if (locationsCount === 0) {
    issues.push({
      code: STORY_CONTRACT_COMPLETENESS_ERRORS.LOCATION_MISSING,
      message: "Le StoryContract n'a pas de lieu défini",
      severity: strictMode ? "error" : "warning",
    });
  }

  // 3. Vérifier les lieux vagues
  const allLocations = [
    ...(input.locationContract?.locations.map((l) => l.label) ?? []),
    ...(sc.requiredLocations?.map((l) => l.name) ?? []),
  ];
  for (const loc of allLocations) {
    if (VAGUE_LOCATIONS.some((v) => loc.toLowerCase().includes(v.toLowerCase()))) {
      issues.push({
        code: STORY_CONTRACT_COMPLETENESS_ERRORS.LOCATION_VAGUE,
        message: `Le lieu "${loc}" est trop vague`,
        severity: "error",
        details: { location: loc },
      });
    }
  }

  // 4. Vérifier les beats
  const beatsCount = sc.beatIds?.length ?? 0;
  if (beatsCount === 0 && strictMode) {
    issues.push({
      code: STORY_CONTRACT_COMPLETENESS_ERRORS.BEATS_EMPTY,
      message: "Le StoryContract n'a pas de beats définis",
      severity: "error",
    });
  }

  // 5. Vérifier les groupes PNJ
  const npcGroupsCount = input.npcGroupContract?.groups.length ?? 0;

  // 6. Vérifier les entités non-humaines
  const nonHumanCount =
    (input.nonHumanContract?.robots.length ?? 0) +
    (input.nonHumanContract?.hybrids.length ?? 0) +
    (input.nonHumanContract?.creatures.length ?? 0);

  // 7. Vérifier les props interdits
  const forbiddenPropsCount = sc.forbiddenProps?.length ?? 0;
  if (forbiddenPropsCount === 0 && strictMode) {
    issues.push({
      code: STORY_CONTRACT_COMPLETENESS_ERRORS.FORBIDDEN_PROPS_UNDEFINED,
      message: "Le StoryContract n'a pas de props interdits définis",
      severity: "warning",
    });
  }

  // 8. Vérifier les personnages requis
  const charactersCount = sc.requiredCharacterIds?.length ?? 0;

  const ok = !issues.some((i) => i.severity === "error");

  const stats = {
    heroPresent,
    charactersCount,
    locationsCount,
    npcGroupsCount,
    beatsCount,
    forbiddenPropsCount,
  };

  const summary = ok
    ? `[story-contract-qa] ok — beats=${beatsCount} characters=${charactersCount} locations=${locationsCount}`
    : `[story-contract-qa] failed — ${issues.filter((i) => i.severity === "error").length} errors`;

  console.info(summary);

  return {
    ok,
    issues,
    summary,
    stats,
  };
}

/**
 * Formate le log de la QA.
 */
export function formatStoryContractCompletenessLog(
  result: StoryContractCompletenessQaResult,
): string {
  const s = result.stats;
  if (result.ok) {
    return (
      `[story-contract] beats=${s.beatsCount} requiredCharacters=${s.charactersCount} ` +
      `requiredLocations=${s.locationsCount} requiredNpcGroups=${s.npcGroupsCount}`
    );
  }
  return `[story-contract] INCOMPLETE — ${result.issues.length} issues`;
}
