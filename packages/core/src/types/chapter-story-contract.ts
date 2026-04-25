/**
 * P1.6 — ChapterStoryContract : contrat d'histoire vérifiable pour un chapitre.
 *
 * Ce contrat définit les éléments narratifs et visuels REQUIS pour le chapitre.
 * Le storyboard ne doit pas inventer d'éléments hors de ce contrat.
 *
 * Exemple pour "Marius au port" :
 * ```json
 * {
 *   "chapterGoal": "Marius revient au port et retrouve Maya après longtemps",
 *   "heroCharacterId": "Marius",
 *   "requiredCharacters": ["Marius", "Maya"],
 *   "requiredNpcGroups": ["pecheurs"],
 *   "requiredLocations": ["port"],
 *   "forbiddenProps": ["smartphone", "phone", "gun", "car"],
 *   "emotionalArc": ["arrivée", "nostalgie", "reconnaissance", "gêne", "retrouvailles", "interruption"]
 * }
 * ```
 *
 * Le pipeline DOIT valider ce contrat AVANT de construire le storyboard.
 */

import { z } from "zod";

/**
 * Élément d'arc émotionnel — une étape du parcours émotionnel du chapitre.
 */
export const emotionalArcStepSchema = z.object({
  step: z.string().min(1),
  /** Beat(s) où cette émotion doit être visible. */
  beatIds: z.array(z.string()).default([]),
  /** Intensité émotionnelle (0-100). */
  intensity: z.number().min(0).max(100).default(50),
});

export type EmotionalArcStep = z.infer<typeof emotionalArcStepSchema>;

/**
 * Groupe PNJ/ambiance requis.
 */
export const requiredNpcGroupSchema = z.object({
  groupId: z.string().min(1),
  label: z.string().min(1),
  /** Description visuelle pour les prompts. */
  visualDescription: z.string().default(""),
  /** Beats où ce groupe DOIT apparaître. */
  requiredInBeatIds: z.array(z.string()).default([]),
  /** Beats où ce groupe PEUT apparaître. */
  optionalInBeatIds: z.array(z.string()).default([]),
});

export type RequiredNpcGroup = z.infer<typeof requiredNpcGroupSchema>;

/**
 * Lieu requis pour le chapitre.
 */
export const requiredLocationSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1),
  /** Description visuelle pour les prompts. */
  visualDescription: z.string().default(""),
  /** Beats où ce lieu est le décor principal. */
  primaryInBeatIds: z.array(z.string()).default([]),
  /** Est-ce le lieu principal du chapitre ? */
  isPrimaryLocation: z.boolean().default(false),
});

export type RequiredLocation = z.infer<typeof requiredLocationSchema>;

/**
 * Prop autorisé pour le chapitre.
 */
export const allowedPropSchema = z.object({
  propId: z.string().min(1),
  canonicalName: z.string().min(1),
  /** Beats où ce prop peut apparaître. */
  allowedInBeatIds: z.array(z.string()).default([]),
  /** Est-ce un prop narrativement important ? */
  isNarrativelyImportant: z.boolean().default(false),
});

export type AllowedProp = z.infer<typeof allowedPropSchema>;

/**
 * ChapterStoryContract — le contrat d'histoire complet pour un chapitre.
 */
export const chapterStoryContractSchema = z.object({
  chapterId: z.string().min(1),
  chapterNumber: z.number().int().min(1),

  // ═══════════════════════════════════════════════════════════════════════════
  // But et narration
  // ═══════════════════════════════════════════════════════════════════════════
  /** Objectif narratif du chapitre en une phrase. */
  chapterGoal: z.string().min(1),
  /** Résumé de l'histoire (intent utilisateur ou généré). */
  storySummary: z.string().default(""),
  /** Ton dominant du chapitre. */
  tone: z.string().default("neutral"),

  // ═══════════════════════════════════════════════════════════════════════════
  // Personnages
  // ═══════════════════════════════════════════════════════════════════════════
  /** ID du héros principal (obligatoire). */
  heroCharacterId: z.string().min(1),
  /** IDs des personnages qui DOIVENT apparaître. */
  requiredCharacterIds: z.array(z.string()).min(1),
  /** IDs des personnages qui PEUVENT apparaître (optionnels). */
  optionalCharacterIds: z.array(z.string()).default([]),

  // ═══════════════════════════════════════════════════════════════════════════
  // Groupes PNJ / Ambiance
  // ═══════════════════════════════════════════════════════════════════════════
  /** Groupes PNJ requis (ex: pêcheurs, foule, passants). */
  requiredNpcGroups: z.array(requiredNpcGroupSchema).default([]),

  // ═══════════════════════════════════════════════════════════════════════════
  // Lieux
  // ═══════════════════════════════════════════════════════════════════════════
  /** Lieux requis pour ce chapitre. */
  requiredLocations: z.array(requiredLocationSchema).min(1),

  // ═══════════════════════════════════════════════════════════════════════════
  // Props
  // ═══════════════════════════════════════════════════════════════════════════
  /** Props autorisés dans ce chapitre. */
  allowedProps: z.array(allowedPropSchema).default([]),
  /**
   * Props INTERDITS — ne doivent JAMAIS apparaître.
   * Ex: smartphone, voiture, arme si l'histoire ne le demande pas.
   */
  forbiddenProps: z.array(z.string()).default([]),

  // ═══════════════════════════════════════════════════════════════════════════
  // Arc émotionnel
  // ═══════════════════════════════════════════════════════════════════════════
  /** Étapes de l'arc émotionnel. */
  emotionalArc: z.array(emotionalArcStepSchema).default([]),

  // ═══════════════════════════════════════════════════════════════════════════
  // Beats
  // ═══════════════════════════════════════════════════════════════════════════
  /** Nombre de beats attendus. */
  expectedBeatCount: z.number().int().min(1).default(10),
  /** IDs des beats (pour référence). */
  beatIds: z.array(z.string()).default([]),
});

export type ChapterStoryContract = z.infer<typeof chapterStoryContractSchema>;

/**
 * Codes d'erreur pour la validation du contrat d'histoire.
 */
export const STORY_CONTRACT_ERROR_CODES = {
  HERO_MISSING: "E_STORY_HERO_MISSING",
  NO_REQUIRED_CHARACTERS: "E_STORY_NO_REQUIRED_CHARACTERS",
  NO_REQUIRED_LOCATIONS: "E_STORY_NO_REQUIRED_LOCATIONS",
  GOAL_MISSING: "E_STORY_GOAL_MISSING",
  HERO_NOT_IN_REQUIRED: "E_STORY_HERO_NOT_IN_REQUIRED",
  FORBIDDEN_PROP_IN_ALLOWED: "E_STORY_FORBIDDEN_PROP_IN_ALLOWED",
} as const;

export type StoryContractErrorCode =
  (typeof STORY_CONTRACT_ERROR_CODES)[keyof typeof STORY_CONTRACT_ERROR_CODES];

export interface StoryContractValidationIssue {
  code: StoryContractErrorCode;
  message: string;
  prop?: string;
  characterId?: string;
}

export interface StoryContractValidationResult {
  ok: boolean;
  issues: StoryContractValidationIssue[];
}

/**
 * Valide un ChapterStoryContract.
 */
export function validateChapterStoryContract(
  contract: ChapterStoryContract,
): StoryContractValidationResult {
  const issues: StoryContractValidationIssue[] = [];

  // Règle 1 : heroCharacterId obligatoire
  if (!contract.heroCharacterId?.trim()) {
    issues.push({
      code: STORY_CONTRACT_ERROR_CODES.HERO_MISSING,
      message: "heroCharacterId is required",
    });
  }

  // Règle 2 : chapterGoal obligatoire
  if (!contract.chapterGoal?.trim()) {
    issues.push({
      code: STORY_CONTRACT_ERROR_CODES.GOAL_MISSING,
      message: "chapterGoal is required",
    });
  }

  // Règle 3 : au moins un personnage requis
  if (!contract.requiredCharacterIds?.length) {
    issues.push({
      code: STORY_CONTRACT_ERROR_CODES.NO_REQUIRED_CHARACTERS,
      message: "requiredCharacterIds must have at least one character",
    });
  }

  // Règle 4 : au moins un lieu requis
  if (!contract.requiredLocations?.length) {
    issues.push({
      code: STORY_CONTRACT_ERROR_CODES.NO_REQUIRED_LOCATIONS,
      message: "requiredLocations must have at least one location",
    });
  }

  // Règle 5 : le héros doit être dans requiredCharacterIds
  if (
    contract.heroCharacterId &&
    contract.requiredCharacterIds?.length &&
    !contract.requiredCharacterIds.includes(contract.heroCharacterId)
  ) {
    issues.push({
      code: STORY_CONTRACT_ERROR_CODES.HERO_NOT_IN_REQUIRED,
      message: `heroCharacterId=${contract.heroCharacterId} must be in requiredCharacterIds`,
      characterId: contract.heroCharacterId,
    });
  }

  // Règle 6 : un prop ne peut pas être à la fois autorisé et interdit
  const forbiddenSet = new Set(contract.forbiddenProps?.map((p) => p.toLowerCase()) ?? []);
  for (const allowed of contract.allowedProps ?? []) {
    if (forbiddenSet.has(allowed.canonicalName.toLowerCase())) {
      issues.push({
        code: STORY_CONTRACT_ERROR_CODES.FORBIDDEN_PROP_IN_ALLOWED,
        message: `prop "${allowed.canonicalName}" cannot be both allowed and forbidden`,
        prop: allowed.canonicalName,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

/**
 * Assertion : lance une erreur si le contrat est invalide.
 */
export class ChapterStoryContractError extends Error {
  code: string = "E_STORY_CONTRACT_INVALID";
  issues: StoryContractValidationIssue[];
  constructor(result: StoryContractValidationResult) {
    const summary = result.issues.map((i) => `${i.code}: ${i.message}`).join(" | ");
    super(`chapter_story_contract_invalid: ${summary}`);
    this.name = "ChapterStoryContractError";
    this.issues = result.issues;
  }
}

export function assertValidChapterStoryContract(contract: ChapterStoryContract): void {
  const result = validateChapterStoryContract(contract);
  if (!result.ok) {
    throw new ChapterStoryContractError(result);
  }
}

/**
 * Construit un ChapterStoryContract à partir des inputs du pipeline.
 */
export function buildChapterStoryContract(input: {
  chapterId: string;
  chapterNumber: number;
  chapterTitle?: string | null;
  chapterSummary?: string | null;
  chapterUserIntent?: string | null;
  heroCharacterId: string;
  characters: Array<{ id: string; name: string; roleType?: string | null }>;
  locations?: Array<{ id: string; name: string; visualDescription?: string }>;
  npcGroups?: Array<{
    id: string;
    label: string;
    visualDescription?: string;
    requiredInBeatIds?: string[];
  }>;
  allowedProps?: Array<{ id: string; name: string }>;
  forbiddenProps?: string[];
  beatIds?: string[];
  tone?: string;
}): ChapterStoryContract {
  // Construire le goal depuis les inputs disponibles
  const chapterGoal =
    input.chapterUserIntent?.trim() ||
    input.chapterSummary?.trim() ||
    input.chapterTitle?.trim() ||
    `Chapitre ${input.chapterNumber}`;

  // Construire les personnages requis (tous les personnages fournis)
  const requiredCharacterIds = input.characters.map((c) => c.id);

  // S'assurer que le héros est dans les personnages requis
  if (!requiredCharacterIds.includes(input.heroCharacterId)) {
    requiredCharacterIds.unshift(input.heroCharacterId);
  }

  // Construire les lieux
  const requiredLocations: RequiredLocation[] = (input.locations ?? []).map((loc, idx) => ({
    locationId: loc.id,
    name: loc.name,
    visualDescription: loc.visualDescription ?? "",
    primaryInBeatIds: [],
    isPrimaryLocation: idx === 0,
  }));

  // Si pas de lieux, créer un lieu par défaut
  if (requiredLocations.length === 0) {
    requiredLocations.push({
      locationId: `default-loc-${input.chapterId}`,
      name: "story-consistent setting",
      visualDescription: "",
      primaryInBeatIds: [],
      isPrimaryLocation: true,
    });
  }

  // Construire les groupes PNJ
  const requiredNpcGroups: RequiredNpcGroup[] = (input.npcGroups ?? []).map((g) => ({
    groupId: g.id,
    label: g.label,
    visualDescription: g.visualDescription ?? "",
    requiredInBeatIds: g.requiredInBeatIds ?? [],
    optionalInBeatIds: [],
  }));

  // Construire les props autorisés
  const allowedProps: AllowedProp[] = (input.allowedProps ?? []).map((p) => ({
    propId: p.id,
    canonicalName: p.name,
    allowedInBeatIds: [],
    isNarrativelyImportant: false,
  }));

  // Props interdits par défaut (objets modernes génériques)
  const defaultForbiddenProps = [
    "smartphone",
    "phone",
    "mobile phone",
    "cellphone",
    "laptop",
    "computer",
    "tablet",
    "television",
    "tv",
  ];
  const forbiddenProps = [
    ...new Set([...defaultForbiddenProps, ...(input.forbiddenProps ?? [])]),
  ];

  return {
    chapterId: input.chapterId,
    chapterNumber: input.chapterNumber,
    chapterGoal,
    storySummary: input.chapterSummary ?? "",
    tone: input.tone ?? "neutral",
    heroCharacterId: input.heroCharacterId,
    requiredCharacterIds,
    optionalCharacterIds: [],
    requiredNpcGroups,
    requiredLocations,
    allowedProps,
    forbiddenProps,
    emotionalArc: [],
    expectedBeatCount: input.beatIds?.length ?? 10,
    beatIds: input.beatIds ?? [],
  };
}

/**
 * Log formaté pour debug/observabilité.
 */
export function formatStoryContractLog(contract: ChapterStoryContract): string {
  const chars = contract.requiredCharacterIds.join(",");
  const locs = contract.requiredLocations.map((l) => l.name).join(",");
  const npcGroups = contract.requiredNpcGroups.map((g) => g.label).join(",") || "none";
  const forbidden = contract.forbiddenProps.length;
  return (
    `[story-contract] beats=${contract.beatIds.length} ` +
    `requiredCharacters=${chars} requiredLocations=${locs} ` +
    `requiredNpcGroups=${npcGroups} forbiddenProps=${forbidden}`
  );
}

/**
 * Vérifie si un prop est interdit par le contrat.
 */
export function isPropForbidden(contract: ChapterStoryContract, propName: string): boolean {
  const normalized = propName.toLowerCase().trim();
  return contract.forbiddenProps.some((f) => normalized.includes(f.toLowerCase()));
}

/**
 * Vérifie si un personnage est requis par le contrat.
 */
export function isCharacterRequired(contract: ChapterStoryContract, characterId: string): boolean {
  return contract.requiredCharacterIds.includes(characterId);
}
