export * from "./types";
export * from "./premium-panel-range";
export * from "./production";
export * from "./approved-outline-utils";
export * from "./rendering-modes";
export * from "./continuity/physical-events";
export * from "./chapter-runtime";
export * from "./outline-ghost-repair";
export * from "./shot-diversity-enforcer";
export * from "./logger";
export * from "./generation";
export * from "./characters";
export * from "./helpers/speaker-panel-detection";
export type { CoverageMetrics, ShotValidationResult } from "./shot-diversity-enforcer";
export {
  computePlannedCoverage,
  computeCoverageGaps,
  validateShotCompliance,
  detectConsecutiveRepetitions,
} from "./shot-diversity-enforcer";
