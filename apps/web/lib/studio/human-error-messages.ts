import type { UserWizardPhaseId } from "@/features/studio/wizard/chapter-wizard-model";

export interface HumanErrorMessage {
  title: string;
  description: string;
  cta: string;
  targetPhase: UserWizardPhaseId;
}

export const HUMAN_ERROR_MESSAGES: Record<string, HumanErrorMessage> = {
  INTENT_CONTRACT_REQUIRED: {
    title: "Ton histoire n'a pas encore été analysée",
    description:
      "Le studio doit transformer ton idée en événements précis avant de créer les pages.",
    cta: "Analyser l'histoire",
    targetPhase: "story",
  },
  missing_environment_visual_dna: {
    title: "Les décors ne sont pas encore prêts",
    description:
      "Chaque case doit savoir où elle se passe pour éviter des décors incohérents.",
    cta: "Créer les décors depuis l'histoire",
    targetPhase: "world",
  },
  canon_pack_incomplete: {
    title: "La fiche personnage est incomplète",
    description:
      "L'apparence du héros doit être fixée pour éviter qu'il change entre les pages.",
    cta: "Compléter la fiche",
    targetPhase: "characters",
  },
  required_dialogue_missing: {
    title: "Un dialogue important manque",
    description:
      "Un personnage doit transmettre une information clé pour respecter ton histoire.",
    cta: "Réparer les dialogues",
    targetPhase: "plan_dialogues",
  },
  PREMIUM_OUTLINE_CONTRACT_INVALID: {
    title: "Le plan du chapitre n'a pas pu être validé",
    description:
      "L'IA a produit un format incomplet. Tu peux relancer la réparation automatique.",
    cta: "Réparer le plan",
    targetPhase: "plan_dialogues",
  },
  DEGRADED_OUTLINE_FALLBACK: {
    title: "Le plan a été généré en mode dégradé",
    description:
      "L'histoire ne correspond pas à ton intention. Relance la génération du plan.",
    cta: "Régénérer le plan",
    targetPhase: "plan_dialogues",
  },
  missing_hero_character: {
    title: "Aucun héros n'est sélectionné",
    description:
      "Ton chapitre a besoin d'un personnage principal pour que l'IA sache qui dessiner.",
    cta: "Choisir un héros",
    targetPhase: "characters",
  },
  PREMIUM_CONTINUITY_PREFLIGHT_FAILED: {
    title: "La cohérence visuelle n'est pas assurée",
    description:
      "Certaines cases n'ont pas les données visuelles nécessaires pour éviter les incohérences.",
    cta: "Vérifier la cohérence",
    targetPhase: "generation",
  },
};

/**
 * Resolve a technical error code to a human-readable message.
 * Returns null if no mapping exists (fallback to raw code).
 */
export function resolveHumanError(code: string): HumanErrorMessage | null {
  if (HUMAN_ERROR_MESSAGES[code]) return HUMAN_ERROR_MESSAGES[code];
  for (const key of Object.keys(HUMAN_ERROR_MESSAGES)) {
    if (code.startsWith(key)) return HUMAN_ERROR_MESSAGES[key];
  }
  return null;
}
