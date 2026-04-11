import OpenAI from "openai";
import type { ProjectContextForChapter } from "../chapter-pipeline";
import type {
  ChapterStudioData,
  AutofillMeta,
} from "@manga-ai-studio/core";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type AutofillMode =
  | "brief"
  | "cast_canon"
  | "plan"
  | "all_missing"
  | "repair_readiness";

export type AutofillFieldProvenance = {
  field: string;
  source: "story_bible" | "previous_chapters" | "characters" | "project_settings" | "inference" | "default";
  confidence: number;
};

export type AutofillResult = {
  suggestedPatch: Partial<ChapterStudioData>;
  assumptions: string[];
  confidence: number;
  unresolvedQuestions: string[];
  appliedFields: string[];
  provenance: AutofillFieldProvenance[];
  meta: AutofillMeta;
};

type AutofillInput = {
  mode: AutofillMode;
  currentData: Partial<ChapterStudioData>;
  context: ProjectContextForChapter;
  force?: boolean;
};

function buildContextSummary(context: ProjectContextForChapter): string {
  const lines: string[] = [];
  lines.push(`Projet : "${context.project.title}" — ${context.project.primaryGenre ?? "genre non précisé"}`);
  if (context.project.pitch) lines.push(`Pitch : ${context.project.pitch}`);
  if (context.project.tone) lines.push(`Ton : ${context.project.tone}`);
  if (context.storyBible?.summary) lines.push(`Story Bible : ${context.storyBible.summary.slice(0, 300)}`);

  if (context.characters && context.characters.length > 0) {
    const charList = context.characters
      .slice(0, 8)
      .map((c) => `${c.name} (${c.roleType ?? "personnage"})`)
      .join(", ");
    lines.push(`Personnages : ${charList}`);
  }

  if (context.recentChapters && context.recentChapters.length > 0) {
    const last = context.recentChapters[context.recentChapters.length - 1];
    lines.push(`Dernier chapitre : ${last.title ?? "sans titre"} — ${last.summary?.slice(0, 150) ?? "pas de résumé"}`);
    if (last.cliffhanger) lines.push(`Cliffhanger précédent : ${last.cliffhanger}`);
  }

  if (context.locations && context.locations.length > 0) {
    const locList = context.locations.slice(0, 5).map((l) => l.name).join(", ");
    lines.push(`Lieux disponibles : ${locList}`);
  }

  return lines.join("\n");
}

function buildCurrentDataSummary(data: Partial<ChapterStudioData>): string {
  const lines: string[] = [];
  if (data.intent?.workingTitle) lines.push(`Titre : ${data.intent.workingTitle}`);
  if (data.intent?.shortPitch) lines.push(`Pitch court : ${data.intent.shortPitch}`);
  if (data.intent?.mainConflict) lines.push(`Conflit : ${data.intent.mainConflict}`);
  if (data.intent?.emotionalGoal) lines.push(`Objectif émotionnel : ${data.intent.emotionalGoal}`);
  if (data.narrativeContract) lines.push(`Contrat narratif : présent`);
  if (data.characterSelection?.heroCharacterId) lines.push(`Héros : ${data.characterSelection.heroCharacterId}`);
  if (data.chapterCanon?.currentLocation) lines.push(`Lieu : ${data.chapterCanon.currentLocation}`);
  if (data.editorialOutline?.beats.length) lines.push(`Outline éditorial : ${data.editorialOutline.beats.length} beats`);
  if (data.productionOutline?.beats.length) lines.push(`Outline production : ${data.productionOutline.beats.length} beats`);
  return lines.length > 0 ? lines.join("\n") : "Aucune donnée renseignée.";
}

function buildMissingFieldsList(data: Partial<ChapterStudioData>, mode: AutofillMode): string[] {
  const missing: string[] = [];

  if (mode === "brief" || mode === "all_missing" || mode === "repair_readiness") {
    if (!data.intent?.shortPitch) missing.push("intent.shortPitch");
    if (!data.intent?.mainConflict) missing.push("intent.mainConflict");
    if (!data.intent?.emotionalGoal) missing.push("intent.emotionalGoal");
    if (!data.intent?.workingTitle) missing.push("intent.workingTitle");
  }

  if (mode === "cast_canon" || mode === "all_missing" || mode === "repair_readiness") {
    if (!data.characterSelection?.heroCharacterId) missing.push("characterSelection.heroCharacterId");
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

function buildPromptForMode(
  mode: AutofillMode,
  contextSummary: string,
  currentDataSummary: string,
  missingFields: string[],
  force: boolean,
): string {
  const forceNote = force
    ? "Tu peux réécrire les champs déjà remplis si tu penses pouvoir les améliorer significativement."
    : "Ne remplis QUE les champs manquants ou vides. Ne modifie PAS les champs déjà renseignés.";

  const baseInstructions = `Tu es un scénariste manga expert. Tu dois compléter intelligemment les informations manquantes d'un chapitre manga en cours de création.

CONTEXTE DU PROJET :
${contextSummary}

DONNÉES ACTUELLES DU CHAPITRE :
${currentDataSummary}

CHAMPS MANQUANTS À COMPLÉTER : ${missingFields.join(", ")}

RÈGLES :
- ${forceNote}
- Base-toi UNIQUEMENT sur le contexte du projet (story bible, personnages, chapitres précédents)
- Ne pas inventer de personnages ou de lieux qui n'existent pas dans le projet
- Reste cohérent avec le ton et le genre du projet
- Si tu ne peux pas déduire une information de manière fiable, indique-la dans unresolvedQuestions
- Chaque suggestion doit avoir une provenance claire (d'où vient l'information)`;

  const modeInstructions: Record<AutofillMode, string> = {
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

  return `${baseInstructions}
${modeInstructions[mode]}

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

function extractAppliedFields(patch: Partial<ChapterStudioData>): string[] {
  const fields: string[] = [];

  if (patch.intent) {
    for (const key of Object.keys(patch.intent)) {
      if ((patch.intent as Record<string, unknown>)[key] != null) {
        fields.push(`intent.${key}`);
      }
    }
  }
  if (patch.narrativeContract) fields.push("narrativeContract");
  if (patch.characterSelection) {
    for (const key of Object.keys(patch.characterSelection)) {
      const val = (patch.characterSelection as Record<string, unknown>)[key];
      if (val != null && (!Array.isArray(val) || val.length > 0)) {
        fields.push(`characterSelection.${key}`);
      }
    }
  }
  if (patch.chapterCanon) {
    for (const key of Object.keys(patch.chapterCanon)) {
      if ((patch.chapterCanon as Record<string, unknown>)[key] != null) {
        fields.push(`chapterCanon.${key}`);
      }
    }
  }
  if (patch.editorialOutline) fields.push("editorialOutline");
  if (patch.productionOutline) fields.push("productionOutline");
  if (patch.productionPlan) fields.push("productionPlan");
  if (patch.entityRegistry) fields.push("entityRegistry");
  if (patch.selectedPlotLabel) fields.push("selectedPlotLabel");

  return fields;
}

function mergePatchRespectingExisting(
  current: Partial<ChapterStudioData>,
  suggested: Partial<ChapterStudioData>,
  force: boolean,
): Partial<ChapterStudioData> {
  if (force) return suggested;

  const merged: Partial<ChapterStudioData> = { ...suggested };

  // Ne pas écraser les champs intent déjà remplis
  if (current.intent && suggested.intent) {
    merged.intent = {
      ...suggested.intent,
      ...Object.fromEntries(
        Object.entries(current.intent).filter(([, v]) => v != null),
      ),
    } as typeof suggested.intent;
  }

  // Ne pas écraser le contrat narratif existant
  if (current.narrativeContract) {
    delete merged.narrativeContract;
  }

  // Ne pas écraser la sélection de personnages si héros déjà choisi
  if (current.characterSelection?.heroCharacterId && suggested.characterSelection) {
    merged.characterSelection = {
      ...suggested.characterSelection,
      heroCharacterId: current.characterSelection.heroCharacterId,
    };
  }

  // Ne pas écraser le canon si lieu déjà défini
  if (current.chapterCanon?.currentLocation && suggested.chapterCanon) {
    merged.chapterCanon = {
      ...suggested.chapterCanon,
      currentLocation: current.chapterCanon.currentLocation,
    };
  }

  // Ne pas écraser les outlines existants
  if (current.editorialOutline?.beats.length) delete merged.editorialOutline;
  if (current.productionOutline?.beats.length) delete merged.productionOutline;
  if (current.productionPlan) delete merged.productionPlan;

  return merged;
}

export async function runChapterAutofill(input: AutofillInput): Promise<AutofillResult> {
  const { mode, currentData, context, force = false } = input;
  const now = new Date().toISOString();

  const missingFields = buildMissingFieldsList(currentData, mode);

  if (missingFields.length === 0 && !force) {
    return {
      suggestedPatch: {},
      assumptions: ["Tous les champs requis pour ce mode sont déjà renseignés."],
      confidence: 1,
      unresolvedQuestions: [],
      appliedFields: [],
      provenance: [],
      meta: {
        source: "ai_autofill",
        generatedAt: now,
        mode,
        confidence: 1,
        assumptions: ["Tous les champs requis pour ce mode sont déjà renseignés."],
        appliedFields: [],
        unresolvedQuestions: [],
      },
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackAutofill(mode, currentData, context, missingFields, now);
  }

  const contextSummary = buildContextSummary(context);
  const currentDataSummary = buildCurrentDataSummary(currentData);
  const prompt = buildPromptForMode(mode, contextSummary, currentDataSummary, missingFields, force);

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_AUTOFILL_MODEL ?? process.env.OPENAI_NARRATIVE_MODEL ?? "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2000,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      suggestedPatch?: Partial<ChapterStudioData>;
      assumptions?: string[];
      confidence?: number;
      unresolvedQuestions?: string[];
      provenance?: AutofillFieldProvenance[];
    };

    const rawPatch = parsed.suggestedPatch ?? {};
    const mergedPatch = mergePatchRespectingExisting(currentData, rawPatch, force);
    const appliedFields = extractAppliedFields(mergedPatch);
    const confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.6));

    const meta: AutofillMeta = {
      source: "ai_autofill",
      generatedAt: now,
      mode,
      confidence,
      assumptions: parsed.assumptions ?? [],
      appliedFields,
      unresolvedQuestions: parsed.unresolvedQuestions ?? [],
    };

    return {
      suggestedPatch: mergedPatch,
      assumptions: parsed.assumptions ?? [],
      confidence,
      unresolvedQuestions: parsed.unresolvedQuestions ?? [],
      appliedFields,
      provenance: parsed.provenance ?? [],
      meta,
    };
  } catch (error) {
    console.warn("[chapter-autofill-engine] Erreur OpenAI :", error);
    return buildFallbackAutofill(mode, currentData, context, missingFields, now);
  }
}

function buildFallbackAutofill(
  mode: AutofillMode,
  currentData: Partial<ChapterStudioData>,
  context: ProjectContextForChapter,
  missingFields: string[],
  now: string,
): AutofillResult {
  const patch: Partial<ChapterStudioData> = {};
  const assumptions: string[] = ["Complétion heuristique (OpenAI indisponible)."];
  const unresolvedQuestions: string[] = [];

  const chapterNumber = currentData.intent?.chapterNumber ?? 1;
  const lastChapter = context.recentChapters?.[context.recentChapters.length - 1];
  const firstChar = context.characters?.[0];
  const firstLocation = context.locations?.[0];

  if (missingFields.includes("intent.workingTitle")) {
    patch.intent = {
      ...patch.intent,
      workingTitle: `Chapitre ${chapterNumber}`,
    };
    assumptions.push("Titre généré par défaut depuis le numéro de chapitre.");
  }

  if (missingFields.includes("intent.shortPitch")) {
    const pitch = lastChapter?.cliffhanger
      ? `Suite du cliffhanger : ${lastChapter.cliffhanger.slice(0, 80)}`
      : `Nouveau chapitre de ${context.project.title ?? "la série"}`;
    patch.intent = { ...patch.intent, shortPitch: pitch };
    assumptions.push("Pitch généré depuis le cliffhanger précédent ou le titre du projet.");
  }

  if (missingFields.includes("intent.mainConflict")) {
    patch.intent = { ...patch.intent, mainConflict: "Conflit à préciser" };
    unresolvedQuestions.push("Quel est le conflit principal de ce chapitre ?");
  }

  if (missingFields.includes("characterSelection.heroCharacterId") && firstChar) {
    patch.characterSelection = {
      ...patch.characterSelection,
      heroCharacterId: firstChar.id,
      activeCharacterIds: [],
      lockedCharacterIds: [],
      speakingCharacterIds: [],
      evolvingCharacterIds: [],
      antagonistCharacterIds: [],
      recurringNpcIds: [],
    };
    assumptions.push(`Héros assigné par défaut : ${firstChar.name} (premier personnage du projet).`);
  }

  if (missingFields.includes("chapterCanon.currentLocation") && firstLocation) {
    patch.chapterCanon = {
      ...patch.chapterCanon,
      currentLocation: firstLocation.name,
      activeCharacters: [],
      allowedVisualChanges: [],
      injuries: [],
      carriedObjects: [],
      continuityNotes: [],
      inheritedFromPreviousChapter: true,
      universeConstraints: [],
    };
    assumptions.push(`Lieu assigné par défaut : ${firstLocation.name}.`);
  }

  if (missingFields.includes("chapterCanon.currentLocation") && !firstLocation) {
    unresolvedQuestions.push("Quel est le lieu principal de ce chapitre ?");
  }

  const appliedFields = extractAppliedFields(patch);
  const confidence = appliedFields.length > 0 ? 0.3 : 0;

  const meta: AutofillMeta = {
    source: "ai_autofill",
    generatedAt: now,
    mode,
    confidence,
    assumptions,
    appliedFields,
    unresolvedQuestions,
  };

  return {
    suggestedPatch: patch,
    assumptions,
    confidence,
    unresolvedQuestions,
    appliedFields,
    provenance: appliedFields.map((f) => ({
      field: f,
      source: "inference" as const,
      confidence: 0.3,
    })),
    meta,
  };
}
