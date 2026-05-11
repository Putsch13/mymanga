/**
 * Construction du prompt LLM pour l'autofill chapitre.
 * Pure : aucune dépendance OpenAI / I/O.
 */
import type { ChapterStudioData } from "@manga-ai-studio/core";
import type { ProjectContextForChapter } from "../../chapter/shared-types";
import {
  buildGenreDirectorPromptHints,
  getGenreDirectorConfig,
  inferGenreMode,
} from "../genre-director";
import type { AutofillMode } from "./types";

export function buildContextSummary(context: ProjectContextForChapter): string {
  const lines: string[] = [];
  lines.push(
    `Projet : "${context.project.title}" — ${context.project.primaryGenre ?? "genre non précisé"}`,
  );
  if (context.project.pitch) lines.push(`Pitch : ${context.project.pitch}`);
  if (context.project.tone) lines.push(`Ton : ${context.project.tone}`);
  if (context.storyBible?.summary)
    lines.push(`Story Bible : ${context.storyBible.summary.slice(0, 300)}`);

  if (context.characters && context.characters.length > 0) {
    const charList = context.characters
      .slice(0, 8)
      .map((c) => `${c.name} (${c.roleType ?? "personnage"})`)
      .join(", ");
    lines.push(`Personnages : ${charList}`);
  }

  if (context.recentChapters && context.recentChapters.length > 0) {
    const last = context.recentChapters[context.recentChapters.length - 1];
    lines.push(
      `Dernier chapitre : ${last.title ?? "sans titre"} — ${last.summary?.slice(0, 150) ?? "pas de résumé"}`,
    );
    if (last.cliffhanger) lines.push(`Cliffhanger précédent : ${last.cliffhanger}`);
  }

  if (context.locations && context.locations.length > 0) {
    const locList = context.locations.slice(0, 5).map((l) => l.name).join(", ");
    lines.push(`Lieux disponibles : ${locList}`);
  }

  return lines.join("\n");
}

export function buildCurrentDataSummary(data: Partial<ChapterStudioData>): string {
  const lines: string[] = [];
  if (data.intent?.workingTitle) lines.push(`Titre : ${data.intent.workingTitle}`);
  if (data.intent?.shortPitch) lines.push(`Pitch court : ${data.intent.shortPitch}`);
  if (data.intent?.mainConflict) lines.push(`Conflit : ${data.intent.mainConflict}`);
  if (data.intent?.emotionalGoal)
    lines.push(`Objectif émotionnel : ${data.intent.emotionalGoal}`);
  if (data.narrativeContract) lines.push(`Contrat narratif : présent`);
  if (data.characterSelection?.heroCharacterId)
    lines.push(`Héros : ${data.characterSelection.heroCharacterId}`);
  if (data.chapterCanon?.currentLocation)
    lines.push(`Lieu : ${data.chapterCanon.currentLocation}`);
  if (data.editorialOutline?.beats.length)
    lines.push(`Outline éditorial : ${data.editorialOutline.beats.length} beats`);
  if (data.productionOutline?.beats.length)
    lines.push(`Outline production : ${data.productionOutline.beats.length} beats`);
  return lines.length > 0 ? lines.join("\n") : "Aucune donnée renseignée.";
}

export function buildMissingFieldsList(
  data: Partial<ChapterStudioData>,
  mode: AutofillMode,
): string[] {
  const missing: string[] = [];

  if (mode === "brief" || mode === "all_missing" || mode === "repair_readiness") {
    if (!data.intent?.shortPitch) missing.push("intent.shortPitch");
    if (!data.intent?.mainConflict) missing.push("intent.mainConflict");
    if (!data.intent?.emotionalGoal) missing.push("intent.emotionalGoal");
    if (!data.intent?.workingTitle) missing.push("intent.workingTitle");
  }

  if (mode === "cast_canon" || mode === "all_missing" || mode === "repair_readiness") {
    if (!data.characterSelection?.heroCharacterId)
      missing.push("characterSelection.heroCharacterId");
    if (!data.chapterCanon?.currentLocation) missing.push("chapterCanon.currentLocation");
    if (!data.chapterCanon?.timeOfDay) missing.push("chapterCanon.timeOfDay");
    if (!data.narrativeContract) missing.push("narrativeContract");
  }

  if (mode === "plan" || mode === "all_missing" || mode === "repair_readiness") {
    if (!data.editorialOutline?.beats.length) missing.push("editorialOutline");
    if (!data.productionOutline?.beats.length) missing.push("productionOutline");
    if (!data.productionPlan) missing.push("productionPlan");
  }

  return missing;
}

export function buildGenreHintsBlock(
  context: ProjectContextForChapter,
  selectedPlotLabel?: string | null,
): string {
  const controls = context.settings
    ? {
        noveltyLevel: context.settings.mysteryLevel ?? 55,
        worldStrictness: context.settings.canonStrictness ?? 80,
      }
    : {};
  const genreMode = inferGenreMode(controls, selectedPlotLabel);
  const genreConfig = getGenreDirectorConfig(genreMode);
  const hints = buildGenreDirectorPromptHints(genreConfig);
  return `\nDIRECTEUR DE GENRE (mode: ${genreMode}) :\n${hints.map((h) => `- ${h}`).join("\n")}\n`;
}

export function buildPromptForMode(
  mode: AutofillMode,
  contextSummary: string,
  currentDataSummary: string,
  missingFields: string[],
  force: boolean,
  genreHintsBlock?: string,
): string {
  const forceNote = force
    ? "Tu peux réécrire les champs déjà remplis si tu penses pouvoir les améliorer significativement."
    : "Ne remplis QUE les champs manquants ou vides. Ne modifie PAS les champs déjà renseignés.";

  const baseInstructions = `Tu es un scénariste manga expert. Tu dois compléter intelligemment les informations manquantes d'un chapitre manga en cours de création.

CONTEXTE DU PROJET :
${contextSummary}
${genreHintsBlock ?? ""}
DONNÉES ACTUELLES DU CHAPITRE :
${currentDataSummary}

CHAMPS MANQUANTS À COMPLÉTER : ${missingFields.join(", ")}

RÈGLES :
- ${forceNote}
- Base-toi UNIQUEMENT sur le contexte du projet (story bible, personnages, chapitres précédents)
- Ne pas inventer de personnages ou de lieux qui n'existent pas dans le projet
- Reste cohérent avec le ton et le genre du projet (respecte les indications du directeur de genre ci-dessus)
- Si tu ne peux pas déduire une information de manière fiable, indique-la dans unresolvedQuestions
- Chaque suggestion doit avoir une provenance claire (d'où vient l'information)`;

  const modeInstructions: Record<Exclude<AutofillMode, "rewrite_beat">, string> = {
    brief: `
MODE : Complétion du brief
Complète les champs de base du chapitre : titre de travail, pitch court, conflit principal, objectif émotionnel.
Propose un selectedPlotLabel cohérent avec le ton du projet.`,

    cast_canon: `
MODE : Casting & Canon
Propose le héros principal, les personnages actifs, le lieu principal, l'heure et la météo.
Génère un contrat narratif minimal (emotionalGoal, heroStateAtStart, heroStateAtEnd, centralConflict, chapterQuestion, endingMode, tone).
Propose un entityRegistry initial avec les personnages secondaires attendus.`,

    plan: `
MODE : Plan du chapitre
Génère un outline éditorial (3-5 beats avec summary, narrativePurpose, dramaticShift).
Génère un outline de production (10-15 beats détaillés).
Ces outlines doivent être cohérents avec le brief et le casting déjà renseignés.`,

    all_missing: `
MODE : Complétion globale
Complète tous les champs manquants dans l'ordre logique : brief → casting → contrat narratif → outlines.
Priorise la cohérence narrative globale.`,

    repair_readiness: `
MODE : Réparation des blocants
Identifie et comble uniquement les champs qui bloquent la génération.
Champs prioritaires : intent.shortPitch, intent.mainConflict, characterSelection.heroCharacterId, chapterCanon.currentLocation, narrativeContract.
Si l'outline manque, propose un outline minimal viable.`,
  };

  const activeInstructions = mode === "rewrite_beat" ? "" : modeInstructions[mode];

  return `${baseInstructions}
${activeInstructions}

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "suggestedPatch": {
    // Uniquement les champs à compléter, avec leur valeur suggérée
    // Respecte exactement la structure ChapterStudioData
  },
  "assumptions": [
    // Liste des hypothèses faites pour générer les suggestions
  ],
  "confidence": 0.0-1.0,
  "unresolvedQuestions": [
    // Ce que tu n'as pas pu déduire et qui nécessite une validation manuelle
  ],
  "provenance": [
    // { "field": "nom.du.champ", "source": "story_bible|previous_chapters|characters|project_settings|inference|default", "confidence": 0.0-1.0 }
  ]
}`;
}
