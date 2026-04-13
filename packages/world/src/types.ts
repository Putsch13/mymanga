import { z } from "zod";

export const boundedSliderSchema = z.number().min(0).max(100);

export const creativityControlsSchema = z.object({
  noveltyLevel: boundedSliderSchema.default(50),
  worldStrictness: boundedSliderSchema.default(80),
  visualExoticism: boundedSliderSchema.default(45),
  npcVariety: boundedSliderSchema.default(55),
  environmentRichness: boundedSliderSchema.default(70),
});

export type CreativityControls = z.infer<typeof creativityControlsSchema>;

export const ontologyEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(["npc", "location", "creature", "prop", "trace"]),
  tags: z.array(z.string()).default([]),
  universes: z.array(z.string()).default([]),
  tones: z.array(z.string()).default([]),
  styles: z.array(z.string()).default([]),
  factions: z.array(z.string()).default([]),
  weathers: z.array(z.string()).default([]),
  worldStates: z.array(z.string()).default([]),
  role: z.string().optional(),
  visualCues: z.array(z.string()).default([]),
  interactionHooks: z.array(z.string()).default([]),
  environmentSignals: z.array(z.string()).default([]),
  rarity: z.number().min(1).max(5).default(3),
});

export type OntologyEntry = z.infer<typeof ontologyEntrySchema>;

export const constraintStrengthSchema = z.enum(["hard", "soft"]);
export type ConstraintStrength = z.infer<typeof constraintStrengthSchema>;

export const constraintNodeTypeSchema = z.enum([
  "universe",
  "tone",
  "style",
  "faction",
  "location",
  "prop",
  "creature",
  "weather",
  "world_state",
  "npc_role",
]);
export type ConstraintNodeType = z.infer<typeof constraintNodeTypeSchema>;

export const constraintNodeSchema = z.object({
  id: z.string(),
  type: constraintNodeTypeSchema,
  value: z.string(),
});
export type ConstraintNode = z.infer<typeof constraintNodeSchema>;

export const constraintEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  strength: constraintStrengthSchema,
  reason: z.string(),
  weight: z.number().min(0).max(1).default(1),
});
export type ConstraintEdge = z.infer<typeof constraintEdgeSchema>;

export const constraintGraphSchema = z.object({
  nodes: z.array(constraintNodeSchema).default([]),
  edges: z.array(constraintEdgeSchema).default([]),
});
export type ConstraintGraph = z.infer<typeof constraintGraphSchema>;

export const sceneBlueprintInputSchema = z.object({
  seed: z.number().int().optional(),
  pageNumber: z.number().int().min(1),
  panelNumber: z.number().int().min(1),
  panelId: z.string(),
  narrative: z.object({
    chapterTitle: z.string().optional().nullable(),
    chapterGoal: z.string().optional().nullable(),
    sceneSummary: z.string(),
    scenePurpose: z.string(),
    panelIntent: z.string(),
    panelNarration: z.string().optional().nullable(),
    pageRole: z.string().optional().nullable(),
  }),
  style: z.object({
    universe: z.string(),
    tone: z.string(),
    visualStyle: z.string(),
    renderFamily: z.string().optional().nullable(),
    cameraLanguage: z.string().optional().nullable(),
    backgroundDensity: z.string().optional().nullable(),
  }),
  scene: z.object({
    location: z.string(),
    timeOfDay: z.string().optional().nullable(),
    weather: z.string().optional().nullable(),
    worldState: z.array(z.string()).default([]),
    factions: z.array(z.string()).default([]),
  }),
  composition: z.object({
    shotType: z.string(),
    cameraAngle: z.string(),
    focusCharacters: z.array(z.string()).default([]),
    requiredCharacters: z.array(z.string()).default([]),
    backgroundExtras: z.array(z.string()).default([]),
  }),
  cast: z.object({
    namedCharacters: z.array(z.string()).default([]),
    npcNames: z.array(z.string()).default([]),
    creatureNames: z.array(z.string()).default([]),
  }),
  controls: creativityControlsSchema.default({}),
  continuity: z.object({
    anchors: z.array(z.string()).default([]),
    worldRules: z.array(z.string()).default([]),
    styleRules: z.array(z.string()).default([]),
    loreConstraints: z.array(z.string()).default([]),
  }),
  // Premium narrative intelligence
  premiumContract: z.object({
    subjectFocus: z.string().optional().nullable(),
    mustShowEnemy: z.boolean().optional(),
    requiredNpcCount: z.number().int().optional(),
    speakerAnchorCharacterId: z.string().optional().nullable(),
    dialogueCarrier: z.enum(["speaker_visible", "offscreen_allowed", "narration"]).optional().nullable(),
    cutawayType: z.string().optional().nullable(),
    heroCenterAllowed: z.boolean().optional(),
    requiredPropNames: z.array(z.string()).default([]),
    antiCollapseReason: z.string().optional().nullable(),
  }).optional(),
});

export type SceneBlueprintInput = z.infer<typeof sceneBlueprintInputSchema>;

export type ProceduralEntity = {
  id: string;
  label: string;
  kind: "npc" | "location" | "creature" | "prop" | "trace";
  role?: string;
  visualCues: string[];
  interactionHooks: string[];
  sourceOntologyId: string;
};

export type ProceduralSelection = {
  primary: ProceduralEntity[];
  secondary: ProceduralEntity[];
  traces: ProceduralEntity[];
};

export type ConstraintDecision = {
  accepted: boolean;
  hardFailures: string[];
  softWarnings: string[];
  score: number;
};

export type SceneBlueprint = {
  id: string;
  seed: number;
  narrativeContext: {
    chapterGoal?: string | null;
    sceneSummary: string;
    scenePurpose: string;
    panelIntent: string;
    panelNarration?: string | null;
    pageRole?: string | null;
    progressionBeat: string;
  };
  styleContext: {
    universe: string;
    tone: string;
    visualStyle: string;
    renderFamily?: string | null;
    cameraLanguage?: string | null;
    backgroundDensity?: string | null;
    noveltyLevel: number;
    worldStrictness: number;
    visualExoticism: number;
    npcVariety: number;
    environmentRichness: number;
  };
  environment: {
    primaryLocation: string;
    secondaryLocationSignals: string[];
    weather: string;
    timeOfDay: string;
    atmosphereSignals: string[];
    foregroundElements: string[];
    midgroundElements: string[];
    backgroundElements: string[];
    mustShowLocationSignals: string[];
    persistentSceneAnchors: string[];
    props: string[];
    traces: string[];
  };
  cast: {
    foregroundSubjects: string[];
    midgroundSubjects: string[];
    backgroundSubjects: string[];
    npcPresence: string[];
    creaturePresence: string[];
  };
  composition: {
    shotType: string;
    cameraAngle: string;
    framingRules: string[];
    interactionBeat: string;
    spatialRelations: string[];
  };
  constraints: {
    hard: string[];
    soft: string[];
    graph: ConstraintGraph;
    decision: ConstraintDecision;
  };
  procedural: {
    selectedNpcs: ProceduralSelection;
    selectedLocations: ProceduralSelection;
    selectedCreatures: ProceduralSelection;
  };
  promptBridge: {
    actionLine: string;
    sceneContextLine: string;
    environmentLine: string;
    hardConstraintLine: string;
    softConstraintLine: string;
    // Premium hard constraints
    requiredPropLine?: string;
    requiredEnemyLine?: string;
    speakerAnchorLine?: string;
    focusLine?: string;
    antiCollapseLine?: string;
    cutawayLine?: string;
  };
};

export type PropertyValidationResult = {
  ok: boolean;
  property: string;
  message: string;
};

export type SceneBlueprintQaCase = {
  id: string;
  title: string;
  input: SceneBlueprintInput;
};

export type SceneBlueprintQaReport = {
  suiteId: "fixed_regression_suite" | "procedural_stress_suite";
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    caseId: string;
    seed: number;
    ok: boolean;
    failures: PropertyValidationResult[];
  }>;
};
