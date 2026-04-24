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
export * from "./densify-premium-blueprints";
export * from "./blueprint-to-canonical-plan";
export * from "./resolve-production-outline-for-premium-pipeline";
export * from "./panel-dialogue-text-plan";
