export * from "./types";
// Pipeline v3 contracts — on ré-exporte explicitement pour éviter les collisions
// avec les types legacy `StoryboardPanel` / `StoryboardPage` définis dans
// `chapter-pipeline.ts` (gardés pour compat legacy). Les types v3 homonymes
// sont exposés sous `@manga-ai-studio/ai/contracts` pour les consumers stricts.
export type {
  // continuity-state
  ContinuityCharacterState,
  ContinuityLocationState,
  ContinuityState,
  // chapter-style-bible
  ChapterStylePalette,
  ChapterInkingStyle,
  ChapterStyleBible,
  // story-arc
  StoryBeatType,
  StoryBeatDangerLevel,
  StoryBeatContinuityEffects,
  StoryBeat,
  StoryArc,
  // storyboard-plan (uniquement les types sans collision)
  StoryboardLayoutTemplate,
  StoryboardRenderMode,
  StoryboardShotType,
  StoryboardCameraAngle,
  StoryboardSubjectFocus,
  StoryboardCutawayType,
  StoryboardPanelDialogue,
  StoryboardPanelVisualAnchors,
  StoryboardEditorialDiagnostics,
  StoryboardPlan,
  // panel-render-spec
  PanelRenderCharacterRole,
  PanelRenderCharacterVisualDna,
  PanelRenderVisibleCharacter,
  PanelRenderContinuityLocks,
  PanelRenderCharacterRef,
  PanelRenderEnvironmentRef,
  PanelRenderLoraBinding,
  PanelRenderPanelRef,
  PanelRenderStyleRef,
  PanelRenderImageReferences,
  PanelRenderConstraints,
  PanelRenderLayoutMeta,
  PanelRenderPanelTextPayload,
  PanelRenderPreviousPanelRef,
  PanelRenderSpec,
  FalReferencePolicy,
  FalRetryPolicy,
  FalRenderRoute,
} from "./contracts";
// Alias pour les types v3 qui entreraient en collision avec le legacy.
// Consommateurs v3 : préférer l'import direct depuis "@manga-ai-studio/ai/contracts".
export type {
  StoryboardPanel as StoryboardPanelV3,
  StoryboardPage as StoryboardPageV3,
} from "./contracts";
export {
  STORY_BEAT_TYPES,
  STORYBOARD_LAYOUT_TEMPLATES,
  STORYBOARD_RENDER_MODES,
  STORYBOARD_SHOT_TYPES,
  STORYBOARD_SUBJECT_FOCUSES,
  STORYBOARD_CUTAWAY_TYPES,
  // COMMIT P3.B
  PANEL_PURPOSES,
  isPanelPurpose,
  // COMMIT P5
  NPC_CATEGORIES,
  isNpcCategory,
  createEmptyContinuityState,
  createDefaultChapterStyleBible,
} from "./contracts";
// COMMIT P3.B + P5 — types enum exposés pour les consumers (tests,
// storyboard-pass, render-spec-validator).
export type { PanelPurpose, NpcCategory, StoryboardPanelNpc } from "./contracts";
// COMMIT H — agent IA1 LLM (le stub est déjà exporté via export *
// plus bas dans ce fichier, cf. ./agents/story-architect-agent).
export { runStoryArchitectAgentLlm } from "./agents/story-architect-agent-llm";
export * from "./image-routing-service";
export * from "./adapters/mock-image-provider";
export * from "./adapters/fal-flux-adapter";
export * from "./adapters/fal-character-adapter";
export * from "./adapters/fal-scene-adapter";
export * from "./adapters/fal-panel-adapter";
export * from "./adapters/bfl-adapter";
export * from "./adapters/runware-adapter";
export * from "./adapters/stability-adapter";
export * from "./run-generation";
export * from "./chapter-outline";
export type { ChapterBundleForSpine, ChapterBundleForSpineOutlineBeat } from "./chapter/chapter-bundle-for-spine";
export * from "./chapter-pipeline";
export * from "./image-generation-config";
export * from "./fal-scene-strategy";
export * from "./fal-benchmark";
export * from "./generation-status";
export * from "./manga-prompt-composer";
export * from "./style-presets";
export * from "./character-visual-composer";
export * from "./services/character-prompt-builder";
export * from "./services/character-sheet-prompt-builder";
export * from "./services/character-lock-builder";
export * from "./services/canon-physical-validator";
export * from "./services/dialogue-writer";
export * from "./services/panel-text-planner";
export * from "./services/chapter-continuity-pass";
export * from "./services/chapter-narrative-coherence-pass";
export * from "./services/scene-environment-engine";
export * from "./services/panel-vision-analyzer";
export * from "./services/lora-training-service";
export * from "./services/prompt-translator";
export * from "./services/fal-job-client";
export * from "./services/fal-storage-service";
export * from "./services/combat-panel-director";
export * from "./services/cover-generator";
export * from "./services/tts-service";
export * from "./services/visual-drift-detector";
export * from "./services/image-similarity-scorer";
export * from "./services/entity-brain";
export * from "./services/entity-brain-v2";
export * from "./services/shot-plan-director";
export * from "./services/adult-engine";
export * from "./character-fingerprint-extractor";
export * from "./panel-validator";
export * from "./preflight-panel-validation";
export * from "./beat-advancement-checker";
export * from "./services/chapter-autofill-engine";
export * from "./services/story-spine";
export * from "./services/genre-director";
export * from "./services/romance-drama-director";
export * from "./services/story-quality-gate";
export * from "./services/llm-story-judge";
export * from "./services/panel-intent-card";
export * from "./services/scene-anchor";
export * from "./services/narrative-fact-extractor";
export * from "./services/narrative-fact-llm-enricher";
export * from "./services/prop-inference-engine";
export * from "./services/panel-blueprint-builder";
export * from "./services/premium-chapter-contract-builder";
export * from "./services/panel-retry-policy";
export * from "./services/ensure-character-fingerprints";
export * from "./services/prop-visual-library";
export * from "./services/page-layout-engine";
export * from "./services/npc-descriptor-builder";
export * from "./services/manga-page-compositor";
export * from "./services/dialogue-placer";
export * from "./services/sfx-extractor";
export * from "./services/physical-events-detector";
export * from "./services/canonical-prompt-recipe-builder";
export * from "./services/canon-binding-resolver";
export * from "./services/packet-aware-reroll-advisor";
export * from "./adapters/fal-prompt-payload-builder";
export * from "./prompts/fal-prompt-flattener";
export * from "./services/shot-planning/chapter-shot-plan";
// Pipeline v3 — Story Architect / Manga Editor / Panel Renderer
export * from "./agents/story-architect-agent";
export * from "./agents/manga-editor-agent";
export * from "./agents/manga-editor-agent-llm";
export * from "./services/chapter-visual-memory";
export * from "./services/render-spec-builder";
export * from "./services/storyboard-panel-layout-meta";
export * from "./services/minimal-panel-prompt-builder";
export * from "./services/fal-render-route-v3";
export * from "./services/required-visual-coverage";
export * from "./services/sanitize-visual-contract";
export * from "./services/extract-chapter-visual-contract";
export * from "./services/dialogue-style-director";
export * from "./services/dialogue-variety-guard";
export * from "./services/dialogue-scene-writer";
export * from "./validators/storyboard-validator";
export * from "./validators/render-spec-validator";
export * from "./validators/visual-coverage-validator";
export * from "./validators/visual-coverage-gap-classifier";
// Repair passes
export * from "./services/repair-render-spec-contradictions";
// Contract coverage
export * from "./services/assert-prompt-contract-coverage";
// Quality module — Visual QA and auto-retry
export * from "./quality";
export * from "./premium-ai-execution-policy";
