/**
 * readiness.ts
 *
 * `buildChapterReadinessReport` — calcule un rapport readiness complet
 * (blockers, warnings, contractStatus, imageCounts, score préparation).
 *
 * Extrait de `chapter-studio-helpers.ts` (audit-v9, < 500 lignes/fichier).
 */

import { classifyPremiumPanelCount, PREMIUM_PANEL_RANGE } from "../../premium-panel-range";
import type {
  ChapterContractStatus,
  ChapterImageCount,
  ChapterLaunchBlockedReason,
  ChapterReadinessIssue,
  ChapterReadinessReport,
  ChapterStudioSnapshot,
  ChapterStudioStep,
} from "../chapter-studio";
import { clamp } from "./_utils";
import { normalizeChapterImageCounts } from "./production-plan";

export function buildChapterReadinessReport(snapshot: ChapterStudioSnapshot): ChapterReadinessReport {
  const completedSteps: ChapterStudioStep[] = [];
  const blockerItems: ChapterReadinessIssue[] = [];
  const warningItems: ChapterReadinessIssue[] = [];

  const addBlocker = (issue: ChapterReadinessIssue) => {
    blockerItems.push(issue);
  };

  const addWarning = (issue: ChapterReadinessIssue) => {
    warningItems.push(issue);
  };

  if (snapshot.data.intent?.shortPitch && snapshot.data.intent.shortPitch.trim().length >= 5) {
    completedSteps.push("intent");
  } else {
    addBlocker({
      id: "missing_intent",
      step: "intent",
      field: "studio-short-pitch",
      message: "Décris ce qui se passe dans ce chapitre (champ Pitch — au moins 5 caractères).",
      ctaLabel: "Remplir le pitch",
      action: "focus_field",
    });
  }

  if (snapshot.data.narrativeContract) {
    completedSteps.push("narrative_contract");
  } else {
    addBlocker({
      id: "missing_narrative_contract",
      step: "narrative_contract",
      field: "studio-emotional-goal",
      message: "Le contrat narratif est manquant.",
      ctaLabel: "Renseigner le contrat narratif",
      action: "focus_field",
    });
  }

  if (snapshot.data.characterSelection?.heroCharacterId) {
    completedSteps.push("characters");
  } else {
    addBlocker({
      id: "missing_hero_character",
      step: "characters",
      field: "studio-hero-character",
      message: "Le héros principal du chapitre doit être sélectionné.",
      ctaLabel: "Choisir le héros",
      action: "focus_field",
    });
  }

  if (snapshot.data.chapterCanon?.currentLocation) {
    completedSteps.push("canon");
  } else {
    addBlocker({
      id: "missing_chapter_location",
      step: "canon",
      field: "studio-location",
      message: "Le canon actif du chapitre doit préciser le décor principal.",
      ctaLabel: "Préciser le décor",
      action: "focus_field",
    });
  }

  const hasEditorialOutline = (snapshot.data.editorialOutline?.beats?.length ?? 0) > 0;
  const productionBeatsCount = snapshot.data.productionOutline?.beats?.length ?? 0;
  const hasProductionOutline = productionBeatsCount >= 10;

  if (hasEditorialOutline) {
    completedSteps.push("editorial_outline");
  } else if (hasProductionOutline) {
    completedSteps.push("editorial_outline");
    addWarning({
      id: "missing_editorial_outline",
      step: "editorial_outline",
      field: null,
      message: "Le résumé éditorial n’a pas été généré, mais le plan détaillé est prêt.",
      ctaLabel: "Régénérer",
      action: "generate_outline",
    });
  } else {
    addBlocker({
      id: "missing_editorial_outline",
      step: "editorial_outline",
      field: null,
      message: "L’outline éditorial n’est pas prêt.",
      ctaLabel: "Générer outline & plan",
      action: "generate_outline",
    });
  }

  if (hasProductionOutline) {
    completedSteps.push("production_outline");
  } else if (productionBeatsCount > 0) {
    completedSteps.push("production_outline");
    addWarning({
      id: "production_outline_too_short",
      step: "production_outline",
      field: null,
      message: `L’outline de production a ${productionBeatsCount} beat(s), idéalement 10+.`,
      ctaLabel: "Régénérer l’outline de production",
      action: "generate_outline",
    });
  } else {
    addBlocker({
      id: "production_outline_too_short",
      step: "production_outline",
      field: null,
      message: "L’outline de production doit contenir au moins 10 beats.",
      ctaLabel: "Régénérer l’outline de production",
      action: "generate_outline",
    });
  }

  let imageCounts: ChapterImageCount;
  let contractStatus: ChapterContractStatus;
  let panelBlueprintCount = 0;
  let launchBlocked = false;
  let launchBlockedReason: ChapterLaunchBlockedReason | null = null;

  if (snapshot.data.productionPlan) {
    completedSteps.push("production_plan");
    imageCounts = normalizeChapterImageCounts({
      estimatedImages: snapshot.data.productionPlan.estimatedImages ?? 0,
      targetImages: snapshot.data.productionPlan.targetImages ?? 0,
      minimumImages: snapshot.data.productionPlan.minimumImages ?? PREMIUM_PANEL_RANGE.min,
      acceptedImages: snapshot.data.readinessReport?.imageCounts.acceptedImages ?? 0,
      generatedImages: snapshot.data.readinessReport?.imageCounts.generatedImages ?? 0,
      rejectedImages: snapshot.data.readinessReport?.imageCounts.rejectedImages ?? 0,
    });

    const blueprints = snapshot.data.productionPlan.panelBlueprints;
    panelBlueprintCount = Array.isArray(blueprints) ? blueprints.length : 0;

    // P8 — CONTRAT COUNT STRICT (mission de refonte premium).
    // Règle produit : le premium doit viser 70–75 panels NATIFS.
    // Si le storyboard natif produit 56 panels → fail immédiat.
    const status = classifyPremiumPanelCount(panelBlueprintCount);
    if (panelBlueprintCount === 0) {
      contractStatus = "missing_blueprints";
      launchBlocked = true;
      launchBlockedReason = "missing_blueprints";
      addBlocker({
        id: "production_plan_missing_blueprints",
        step: "production_plan",
        field: null,
        message:
          `Le plan ne contient aucun blueprint de panel. ` +
          `Régénère le plan avant de lancer la génération.`,
        ctaLabel: "Régénérer le plan",
        action: "generate_outline",
      });
    } else if (status === "under_min") {
      contractStatus = "incomplete_blueprints";
      launchBlocked = true;
      launchBlockedReason = "incomplete_plan";
      addBlocker({
        id: "production_plan_under_native_range",
        step: "production_plan",
        field: null,
        message:
          `Le plan natif contient ${panelBlueprintCount} panels (range premium requise : ${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max}). ` +
          `La génération est bloquée : un storyboard trop court produit un chapitre incomplet. ` +
          `Régénère un plan plus dense avant de lancer.`,
        ctaLabel: "Régénérer le plan",
        action: "generate_outline",
      });
    } else if (status === "over_max") {
      contractStatus = "incomplete_blueprints";
      launchBlocked = true;
      launchBlockedReason = "incomplete_plan";
      addBlocker({
        id: "production_plan_over_native_range",
        step: "production_plan",
        field: null,
        message:
          `Le plan natif contient ${panelBlueprintCount} panels (range premium requise : ${PREMIUM_PANEL_RANGE.min}-${PREMIUM_PANEL_RANGE.max}). ` +
          `La génération est bloquée : compactage éditorial requis.`,
        ctaLabel: "Régénérer le plan",
        action: "generate_outline",
      });
    } else {
      contractStatus = "ok";
    }
  } else {
    imageCounts = normalizeChapterImageCounts(null);
    contractStatus = "missing_production_plan";
    launchBlocked = true;
    launchBlockedReason = "missing_production_plan";
    addBlocker({
      id: "missing_production_plan",
      step: "production_plan",
      field: null,
      message: "Le plan de production n’a pas encore été calculé.",
      ctaLabel: "Générer outline & plan",
      action: "generate_outline",
    });
  }

  if ((snapshot.data.chapterCanon?.continuityNotes?.length ?? 0) === 0) {
    addWarning({
      id: "missing_continuity_notes",
      step: "canon",
      field: "studio-continuity-notes",
      message: "Aucune note de continuité n’a été fournie pour le chapitre.",
      ctaLabel: "Ajouter une note de continuité",
      action: "focus_field",
    });
  }

  if ((snapshot.data.characterCanons ?? []).length === 0) {
    addWarning({
      id: "missing_character_canons",
      step: "characters",
      field: "studio-hero-character",
      message: "Aucun canon personnage détaillé n’est encore rattaché au chapitre.",
      ctaLabel: "Vérifier le casting",
      action: "focus_field",
    });
  }

  // Root cause drift persistant : si un personnage MAIN_HERO ou SECONDARY_CORE
  // part en génération sans CharacterCanonPack solide (absent ou completeness
  // < 0.5), le lock visuel est reconstruit à chaque génération à partir de
  // bribes incomplètes → dérive de visage/cheveux/outfit chapitre après chapitre.
  const heroId = snapshot.data.characterSelection?.heroCharacterId;
  const canonsByChar = snapshot.data.characterCanons ?? [];
  for (const canon of canonsByChar) {
    const isMain = canon.importanceTier === "MAIN_HERO" || canon.importanceTier === "SECONDARY_CORE";
    if (!isMain) continue;
    const isHero = canon.characterId === heroId;
    const score = canon.canonPackCompleteness;
    const hasPack = canon.hasCanonPack === true;
    const isIncomplete = !hasPack || (typeof score === "number" && score < 0.5);
    if (!isIncomplete) continue;
    const label = canon.canonicalName || canon.role || "Personnage principal";
    addWarning({
      id: `canon_pack_incomplete_${canon.characterId}`,
      step: "characters",
      field: isHero ? "studio-hero-character" : null,
      message:
        `${label} n'a pas de CanonPack complet${typeof score === "number" ? ` (score ${Math.round(score * 100)}%)` : ""}. ` +
        "Génère-le dans le studio personnage pour éviter la dérive visuelle d'un chapitre à l'autre.",
      ctaLabel: "Ouvrir le studio personnage",
      action: "focus_field",
    });
  }

  const preparationScore = clamp(
    100 - blockerItems.length * 14 - warningItems.length * 4 + completedSteps.length * 6,
    0,
    100,
  );

  return {
    status: blockerItems.length > 0 ? "blocked" : warningItems.length > 0 ? "warning" : "ready",
    preparationScore,
    blockingIssues: blockerItems.map((issue) => issue.message),
    warnings: warningItems.map((issue) => issue.message),
    blockerItems,
    warningItems,
    completedSteps,
    imageCounts,
    panelBlueprintCount,
    contractStatus,
    contractComplete: contractStatus === "ok",
    launchBlocked,
    launchBlockedReason,
  };
}
