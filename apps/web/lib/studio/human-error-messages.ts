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
      "Le pack canon est calculé sur la fiche en base (objectif, bio, tenue, refs visuelles, etc.). Vérifie aussi le co-protagoniste ou l'antagoniste si le blocage persiste — la réponse API liste les champs manquants dans `canonPackDiagnostics`.",
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
  missing_prop_insert: {
    title: "Aucun gros plan d'objet narratif prévu",
    description:
      "Ton histoire mentionne un objet important mais aucune case ne le montre en détail.",
    cta: "Réparer le plan",
    targetPhase: "plan_dialogues",
  },
  missing_weapon_insert: {
    title: "Aucun insert arme/objet clé prévu",
    description:
      "Une arme ou un objet clé est requis par l'histoire mais n'a pas de case dédiée.",
    cta: "Réparer le plan",
    targetPhase: "plan_dialogues",
  },
  missing_npc_population: {
    title: "Les personnages secondaires n'ont pas de panel",
    description:
      "Un groupe de personnages est requis par l'histoire mais absent du découpage.",
    cta: "Réparer le plan",
    targetPhase: "plan_dialogues",
  },
  CONTRACTUAL_FOCUS_INADEQUATE: {
    title: "Le plan de production est déséquilibré",
    description:
      "Il manque des cases de décor, d'objets ou de personnages secondaires dans le plan.",
    cta: "Réparer le plan",
    targetPhase: "plan_dialogues",
  },
  INTENT_COVERAGE_TOO_LOW: {
    title: "Le plan ne couvre pas assez ton histoire",
    description:
      "Des événements importants de ton intention ne sont pas représentés dans le plan.",
    cta: "Vérifier l'histoire",
    targetPhase: "story",
  },
  CANON_PACK_INCOMPLETE: {
    title: "La fiche d'un personnage principal est incomplète",
    description:
      "Le lancement exige ≥ 70 % sur le pack canon (nom, bio, apparence, voix, ADN stable, au moins une ref visuelle). Souvent le blocage vient du co-protagoniste, de l'antagoniste marqué comme rôle clé, ou d'un snapshot studio pas à jour — les champs sont relus depuis la base ; la réponse « launch » inclut `canonPackDiagnostics` (liste `missing`) par personnage.",
    cta: "Compléter la fiche personnage",
    targetPhase: "characters",
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
