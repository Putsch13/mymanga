/**
 * chapter-interview-planner.ts
 *
 * Cœur de l'interviewer IA (refonte UX conversationnelle).
 *
 * Fonction PURE et déterministe : à partir du `ChapterIntentContract` compilé
 * (+ les persos déjà configurés à l'étape 1 + les questions déjà traitées),
 * elle calcule la prochaine fournée de questions ciblées à poser à l'auteur.
 *
 * Principe : on ne demande JAMAIS ce qu'on sait déjà. Chaque question vise
 * un trou réel du contrat (champ vide) ou un `ambiguityFlag` levé par le
 * compilateur. Les réponses réalimentent le contrat (USER-WINS) côté endpoint.
 *
 * Pas d'appel LLM ici : rapide, gratuit, testable, et la formulation des
 * questions reste sous contrôle produit (ton, langue, exemples cliquables).
 */

import type { ChapterIntentContract } from "@manga-ai-studio/core";

export type InterviewQuestionKind =
  | "main_event"
  | "era"
  | "location"
  | "npcs"
  | "creatures"
  | "props"
  | "emotional_goal"
  | "cliffhanger"
  | "tone";

/** Criticité : `critical` bloque le launch tant que non traité. */
export type InterviewQuestionSeverity = "critical" | "recommended" | "optional";

export interface InterviewQuestion {
  id: string;
  kind: InterviewQuestionKind;
  /** Champ(s) du contrat alimenté(s) par la réponse. */
  targetField: keyof ChapterIntentContract;
  severity: InterviewQuestionSeverity;
  /** Question prête à afficher (FR). */
  question: string;
  /** Courte justification UX (pourquoi on demande ça). */
  why: string;
  /** Suggestions cliquables (chips). */
  examples: string[];
}

export interface InterviewPlanInput {
  contract: ChapterIntentContract;
  /** Persos déjà configurés (étape 1) — on ne les redemande pas. */
  knownCharacterNames: string[];
  /** PNJ déjà résolus via /npc-resolve. */
  resolvedNpcNames?: string[];
  /**
   * Kinds déjà traités dans la conversation (l'auteur a répondu, même
   * "aucun"). Permet de ne pas reposer une question à laquelle il a dit non.
   */
  answeredKinds?: InterviewQuestionKind[];
}

export interface InterviewPlan {
  /** Prochaines questions à poser, triées par criticité puis ordre logique. */
  questions: InterviewQuestion[];
  /** Aucune question `critical` restante → config minimale prête au launch. */
  ready: boolean;
  /** Nombre de trous critiques restants. */
  criticalRemaining: number;
  /** Progression 0–1 pour la barre du canevas. */
  completion: number;
}

function isFilled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Toutes les questions candidates, dans l'ordre logique d'une interview. */
function buildCandidateQuestions(input: InterviewPlanInput): InterviewQuestion[] {
  const c = input.contract;
  const answered = new Set(input.answeredKinds ?? []);
  const candidates: InterviewQuestion[] = [];

  const needMainEvent =
    !isFilled(c.plotGoal) &&
    c.mustInclude.length === 0 &&
    (c.understoodPitch ?? "").trim().length < 40;
  if (needMainEvent && !answered.has("main_event")) {
    candidates.push({
      id: "q_main_event",
      kind: "main_event",
      targetField: "plotGoal",
      severity: "critical",
      question: "Que se passe-t-il concrètement dans ce chapitre ? Raconte l'action principale en une ou deux phrases.",
      why: "C'est le moteur du découpage en cases. Sans événement concret, le plan reste vague.",
      examples: [
        "Le héros découvre que son mentor l'a trahi",
        "Une embuscade tourne mal dans le port",
        "Première rencontre tendue avec la rivale",
      ],
    });
  }

  if (!isFilled(c.era) && !answered.has("era")) {
    candidates.push({
      id: "q_era",
      kind: "era",
      targetField: "era",
      severity: "critical",
      question: "À quelle époque / dans quel registre se déroule la scène ?",
      why: "L'époque pilote les costumes, l'architecture et les objets envoyés au rendu.",
      examples: ["Médiéval-fantasy", "Japon Edo", "Cyberpunk proche futur", "Contemporain"],
    });
  }

  const hasLocation = isFilled(c.setting) || c.requiredLocations.length > 0;
  if (!hasLocation && !answered.has("location")) {
    candidates.push({
      id: "q_location",
      kind: "location",
      targetField: "setting",
      severity: "critical",
      question: "Où ça se passe ? Décris le ou les décors principaux du chapitre.",
      why: "Les décors deviennent le VisualWorldContract.locations — c'est l'ancrage spatial des cases.",
      examples: ["Un village portuaire au crépuscule", "L'intérieur d'un temple en ruine", "Une station orbitale"],
    });
  }

  if (c.requiredNpcs.length === 0 && (input.resolvedNpcNames?.length ?? 0) === 0 && !answered.has("npcs")) {
    candidates.push({
      id: "q_npcs",
      kind: "npcs",
      targetField: "requiredNpcs",
      severity: "recommended",
      question:
        "Y a-t-il des personnages secondaires / PNJ ? Donne pour chacun un nom + une brève description (ou réponds « aucun »).",
      why: "Chaque PNJ nommé est structuré par l'IA et réutilisable. Sinon le LLM improvise des figurants incohérents.",
      examples: ["Aubergiste bourru qui tient le pub", "Garde du port méfiant", "Aucun"],
    });
  }

  if (c.requiredCreatures.length === 0 && !answered.has("creatures")) {
    candidates.push({
      id: "q_creatures",
      kind: "creatures",
      targetField: "requiredCreatures",
      severity: "recommended",
      question:
        "Des créatures, monstres ou animaux importants ? Nom + apparence (ou « aucun »).",
      why: "Les créatures ont leur propre route de rendu (creature_reveal). Mal décrites = silhouettes ratées.",
      examples: ["Un loup spectral aux yeux bleus", "Dragon de fumée", "Aucun"],
    });
  }

  if (!isFilled(c.emotionalGoal) && !isFilled(c.characterArcGoal) && !answered.has("emotional_goal")) {
    candidates.push({
      id: "q_emotional_goal",
      kind: "emotional_goal",
      targetField: "emotionalGoal",
      severity: "recommended",
      question: "Quelle émotion ou quel basculement intérieur doit ressortir à la fin du chapitre ?",
      why: "Guide le ton des dialogues et l'arc émotionnel des cases.",
      examples: ["La peur cède à la détermination", "Une trahison qui blesse", "Un soulagement amer"],
    });
  }

  if (c.requiredProps.length === 0 && !answered.has("props")) {
    candidates.push({
      id: "q_props",
      kind: "props",
      targetField: "requiredProps",
      severity: "optional",
      question: "Des objets clés à montrer (arme signature, artefact, lettre…) ? (ou « aucun »)",
      why: "Les props plot deviennent des cases insert dédiées et restent cohérents entre chapitres.",
      examples: ["Une épée brisée", "Une lettre scellée", "Aucun"],
    });
  }

  if (!answered.has("cliffhanger")) {
    candidates.push({
      id: "q_cliffhanger",
      kind: "cliffhanger",
      targetField: "expectedCliffhanger",
      severity: "optional",
      question: "Le chapitre doit-il finir sur un cliffhanger ?",
      why: "Oriente la dernière case et la promesse narrative du chapitre suivant.",
      examples: ["Oui, sur une révélation", "Non, fin posée"],
    });
  }

  return candidates;
}

const SEVERITY_RANK: Record<InterviewQuestionSeverity, number> = {
  critical: 0,
  recommended: 1,
  optional: 2,
};

/**
 * Planifie la prochaine fournée de questions. `maxQuestions` borne l'affichage
 * (UX : on ne noie pas l'auteur — 1 à 3 questions à la fois).
 */
export function planInterviewQuestions(
  input: InterviewPlanInput,
  maxQuestions = 3,
): InterviewPlan {
  const candidates = buildCandidateQuestions(input).sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );

  const criticalRemaining = candidates.filter((q) => q.severity === "critical").length;

  // Progression : 1 - (poids des trous restants / poids total possible).
  // Critique pèse 3, recommandé 2, optionnel 1.
  const weight = (s: InterviewQuestionSeverity) => (s === "critical" ? 3 : s === "recommended" ? 2 : 1);
  const remainingWeight = candidates.reduce((sum, q) => sum + weight(q.severity), 0);
  const TOTAL_WEIGHT = 3 /*event*/ + 3 /*era*/ + 3 /*loc*/ + 2 /*npc*/ + 2 /*creature*/ + 2 /*emo*/ + 1 /*props*/ + 1 /*cliff*/;
  const completion = Math.max(0, Math.min(1, 1 - remainingWeight / TOTAL_WEIGHT));

  return {
    questions: candidates.slice(0, maxQuestions),
    ready: criticalRemaining === 0,
    criticalRemaining,
    completion,
  };
}
