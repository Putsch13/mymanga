/**
 * Production module — Source de vérité unique pour la structure des chapitres.
 *
 * Ce module exporte tous les types, fonctions et configurations nécessaires
 * à la planification de production d'un chapitre manga/webtoon.
 *
 * RÈGLE ABSOLUE: Toute logique de structuration de chapitre doit utiliser ce module.
 */

export * from "./production-rules";
export * from "./canonical-production-plan";
export * from "./normalize-outline";
export * from "./panel-rhythm-planner";
export * from "./production-plan-qa";
export * from "./build-canonical-production-plan";
export * from "./ensure-canonical-production-plan";
export * from "./distributed-cutaway-rhythm";
export * from "./retry-strategy";
export * from "./blueprint-to-canonical-plan";
export * from "./canonical-to-premium-blueprints";
export * from "./merge-raw-blueprints-with-canonical-rhythm";
export * from "./hydrate-blueprints-with-character-dna";
export * from "./premium-pipeline-character-visual-dna";
export * from "./hydrate-blueprints-with-environment-dna";
export * from "./hydrate-blueprints-with-prop-dna";
export * from "./hydrate-blueprints-with-npc-dna";
export * from "./hydrate-blueprints-with-visual-world-npc-prop";
export * from "./panel-provenance-hydrate";
export * from "./resolve-character-refs";
export * from "./panel-continuity-preflight";
export * from "./resolve-production-outline-for-premium-pipeline";
export * from "./panel-dialogue-text-plan";
export * from "./build-beat-micro-storyboard";
