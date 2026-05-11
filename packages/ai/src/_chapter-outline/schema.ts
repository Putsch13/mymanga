/**
 * Schémas Zod et types publics du chapter-outline.
 *
 * Le générateur LLM doit produire un JSON conforme à `outlineResultSchema`.
 * Les types `ChapterOutlineContext` et `ChapterOutlineResult` sont la
 * surface publique consommée par le pipeline.
 */
import { z } from "zod";
import { zodLlmEnum } from "@manga-ai-studio/core";
import type { CreativityControls } from "@manga-ai-studio/world";
import type { GenerationOperationalStatus } from "../generation-status";

export const PAGE_ROLES = [
  "establishing",
  "escalation",
  "confrontation",
  "revelation",
  "aftermath",
  "cliffhanger",
] as const;

export type PageRole = (typeof PAGE_ROLES)[number];

// FIX-19 (MAJEUR) — Tous les `z.enum(...)` sur des sorties LLM sont
// remplacés par `zodLlmEnum(...)` qui tolère les variations de casse,
// les formes pluriels et certaines réponses sous forme d'array (`["x"]`
// → `"x"`). Sans ça, un enum strict bloquait la génération premium au
// moindre écart linguistique du modèle.
const outlineArcPromiseSchema = z.object({
  arcName: z.string().min(1),
  promise: z.string().min(3),
  stage: zodLlmEnum(["setup", "progression", "payoff", "twist"]),
  priority: zodLlmEnum(["low", "medium", "high"]).default("medium"),
  payoffTarget: z.string().nullable().optional(),
});

const outlineWorldConsequenceSchema = z.object({
  consequenceType: z.string().min(1),
  description: z.string().min(3),
  scope: zodLlmEnum(["local", "chapter", "world"]).default("local"),
  persistence: zodLlmEnum(["temporary", "lasting", "permanent"]).default("lasting"),
  affectedLocations: z.array(z.string()).default([]),
  affectedCharacters: z.array(z.string()).default([]),
});

const outlineSetupPayoffHookSchema = z.object({
  hookId: z.string().min(1),
  label: z.string().min(3),
  kind: zodLlmEnum(["setup", "foreshadowing", "echo", "payoff"]),
  targetBeatHint: z.string().nullable().optional(),
  resolved: z.boolean().optional().default(false),
});

export const structuredBeatPayloadSchema = z.object({
  source: z
    .enum(["generator_structured", "heuristic_fallback"])
    .default("heuristic_fallback"),
  confidence: z.number().min(0).max(1).default(0.45),
  arcPromises: z.array(outlineArcPromiseSchema).default([]),
  worldConsequences: z.array(outlineWorldConsequenceSchema).default([]),
  setupPayoffHooks: z.array(outlineSetupPayoffHookSchema).default([]),
});

const STORY_FUNCTIONS = [
  "setup",
  "discovery",
  "dialogue_tension",
  "investigation",
  "movement",
  "revelation",
  "aftermath",
  "decision",
  "transition",
] as const;
const ACTION_ENVELOPES = [
  "none",
  "micro",
  "physical_nonviolent",
  "combat_light",
  "combat_full",
] as const;
const VISUAL_ESCALATION_POLICIES = [
  "forbid_invented_action",
  "allow_literal_only",
  "allow_stylized_intensification",
] as const;

const beatNarrativeContractSchema = z.object({
  beatId: z.string().min(1),
  summary: z.string().min(1),
  storyFunction: zodLlmEnum(STORY_FUNCTIONS),
  actionEnvelope: zodLlmEnum(ACTION_ENVELOPES),
  visualEscalationPolicy: zodLlmEnum(VISUAL_ESCALATION_POLICIES),
  causalInputs: z.array(z.string()).default([]),
  causalOutputs: z.array(z.string()).default([]),
  forbiddenVisualEvents: z.array(z.string()).default([]),
  requiredVisualEvents: z.array(z.string()).default([]),
});

export const outlineResultSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(20),
  cliffhanger: z.string().min(5),
  beats: z
    .array(
      z.object({
        summary: z.string().min(10),
        emotionalTone: z.string().optional(),
        pageRole: zodLlmEnum(PAGE_ROLES).default("escalation"),
        turn: z.string().default(""),
        emotionalDelta: z.number().min(-3).max(3).default(0),
        location: z.string().default(""),
        characters: z.array(z.string()).default([]),
        structuredBeat: structuredBeatPayloadSchema.default({
          source: "heuristic_fallback",
          confidence: 0.45,
          arcPromises: [],
          worldConsequences: [],
          setupPayoffHooks: [],
        }),
        // Phase 1: optional structured narrative contract. When absent, the
        // normalizer derives a conservative default from pageRole via
        // beatContractFromLegacyRole (which will NOT silently escalate to
        // combat). When present, it overrides the legacy-derived fallback.
        beatNarrativeContract: beatNarrativeContractSchema.optional(),
      }),
    )
    .min(3)
    .max(10),
});

export type ChapterOutlineResult = z.infer<typeof outlineResultSchema>;

export type ChapterOutlineContext = {
  projectTitle: string;
  pitch: string | null;
  description?: string | null;
  primaryGenre: string | null;
  subGenres?: string[];
  tone?: string | null;
  visualStyle?: string | null;
  styleGuide?: string | null;
  cast?: Array<{
    name: string;
    roleType?: string | null;
    objective?: string | null;
    status?: string | null;
    fear?: string | null;
    traits?: string[];
    appearance?: string | null;
  }>;
  intentEntities?: Array<{
    name: string;
    entityKind?: string | null;
    dialogueMode?: string | null;
    recurrencePolicy?: string | null;
    roleHint?: string | null;
    speciesLabel?: string | null;
  }>;
  knownLocations?: Array<{
    name: string;
    type?: string | null;
    description?: string | null;
    aliases?: string[];
  }>;
  relationships?: Array<{ source: string; target: string; type: string }>;
  arcs?: Array<{ name: string; summary: string | null; status: string }>;
  allRecentChapters?: Array<{
    chapterNumber: number;
    title: string | null;
    summary: string | null;
    cliffhanger: string | null;
  }>;
  bibleSummary?: string | null;
  themes?: string[];
  continuitySnippets?: string[];
  recentContinuityEvents?: Array<{
    eventType: string;
    summary: string | null;
    permanent: boolean;
    importance: number;
  }>;
  retrievedContext?: string[];
  settings?: {
    dialogueDensity?: number | null;
    darknessLevel?: number | null;
    mysteryLevel?: number | null;
    violenceLevel?: number | null;
    romanceLevel?: number | null;
    sensualityLevel?: number | null;
    canonStrictness?: number | null;
  } | null;
  chapterNumber: number;
  chapterTitle: string | null;
  userIntent: string;
  quickTag: string | null;
  creativityControls?: Partial<CreativityControls> | null;
  previousSummary: string | null;
  previousCliffhanger: string | null;
  seriesSynopsis?: string | null;
  targetBeats?: number;
};

export type ChapterOutlineGenerationResult = {
  outline: ChapterOutlineResult;
  usedOpenAI: boolean;
  model?: string;
  degradedStatus: GenerationOperationalStatus;
  fallbackReason?: string;
};

export class PremiumOutlineContractInvalidError extends Error {
  override name = "PremiumOutlineContractInvalidError" as const;
  constructor(
    public zodError: z.ZodError | null,
    reason?: string,
  ) {
    super(
      `PremiumOutlineContractInvalidError: ${reason ?? "outline_contract_invalid"} — ${
        zodError
          ? zodError.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
          : "unknown"
      }`,
    );
  }
}
