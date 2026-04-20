/**
 * ChapterImagePlanFromNarrative — adapter qui transforme la sortie du
 * narrative pass (plannedImages + baseMetadata) en `ChapterImagePlanItem[]`
 * consommables par le compilateur visuel canonique.
 *
 * Entrée : la forme actuelle de `PlannedImage` du narrative-pass (metadata
 * riche mais faiblement typée) + un peu de contexte chapitre.
 *
 * Sortie : plan canonique typé, utilisable par le reste du pipeline sans
 * toucher aux prompts libres existants.
 */

import type {
  ContentRating,
  ImageIntentType,
} from "@manga-ai-studio/core";
import {
  buildChapterImagePlan,
  validateChapterImagePlan,
  type ChapterImagePlanItem,
  type ChapterImagePlanBuilderInput,
  type ChapterBeatPlanInput,
  type ChapterPanelPlanInput,
  type ChapterImagePlanValidationResult,
} from "./chapter-image-plan-builder";

export interface NarrativePlannedImageLike {
  sceneImageId: string;
  sceneIndex: number;
  panel: {
    panelNumber: number;
    characters?: string[];
    mood?: string | null;
    camera?: string | null;
    caption?: string | null;
  };
  baseMetadata: Record<string, unknown>;
}

export interface NarrativeToPlanInput {
  projectId: string;
  chapterId: string;
  mangaStyleProfile: string;
  contentRating: ContentRating;
  plannedImages: NarrativePlannedImageLike[];
  rawCharacters: Array<{ id: string; name: string; roleType?: string | null }>;
}

export interface NarrativeToPlanResult {
  plan: ChapterImagePlanItem[];
  validation: ChapterImagePlanValidationResult;
  planItemBySceneImageId: Map<string, ChapterImagePlanItem>;
}

// ────────────────────────────────────────────────────────────────────────────
// Mapping helpers
// ────────────────────────────────────────────────────────────────────────────

function normalizeRating(value: unknown): ContentRating {
  if (typeof value !== "string") return "teen";
  const lower = value.toLowerCase();
  if (lower.includes("explicit") || lower.includes("adult_explicit")) return "explicit_adult";
  if (lower.includes("mature") || lower.includes("adult")) return "mature";
  if (lower.includes("teen")) return "teen";
  if (lower.includes("all_ages") || lower.includes("all-ages") || lower.includes("kids")) {
    return "all_ages";
  }
  return "teen";
}

function roleTypeToRole(
  roleType: string | null | undefined,
): "hero" | "enemy" | "ally" | "npc" | "other" {
  if (!roleType) return "other";
  const lower = roleType.toLowerCase();
  if (/hero|protagon|main_hero|héros/i.test(lower)) return "hero";
  if (/villain|antagon|enemy|boss|rival/i.test(lower)) return "enemy";
  if (/ally|companion|support/i.test(lower)) return "ally";
  if (/npc/i.test(lower)) return "npc";
  return "other";
}

function mapPlannedImageToPanelInput(
  img: NarrativePlannedImageLike,
  rawCharacters: NarrativeToPlanInput["rawCharacters"],
  pageIndex: number,
): ChapterPanelPlanInput {
  const meta = img.baseMetadata as Record<string, unknown>;
  const panelContract = (meta.panelContract as Record<string, unknown> | undefined) ?? {};

  const subjectFocus = (panelContract.subjectFocus as string | null | undefined) ?? null;
  const cutawayRaw = (panelContract.cutawayType as string | null | undefined) ?? null;
  const cutawayType = cutawayRaw === "none" ? null : cutawayRaw;
  const shotType = (panelContract.shotType as string | null | undefined) ?? null;

  const beatType =
    (panelContract.beatType as string | null | undefined) ??
    (meta.beatType as string | null | undefined) ??
    null;

  const panelCharacterNames = img.panel.characters ?? [];
  const panelCharacterRoles: string[] = [];
  for (const name of panelCharacterNames) {
    const raw = rawCharacters.find((c) => c.name === name);
    panelCharacterRoles.push(roleTypeToRole(raw?.roleType ?? null));
  }

  const npcPresence = Array.isArray(meta.npcPresence) ? (meta.npcPresence as string[]) : [];
  const npcGroupPresence = Array.isArray(meta.npcGroupPresence)
    ? (meta.npcGroupPresence as string[])
    : [];

  const requiredProps = (() => {
    const typed = panelContract.requiredPropsTyped as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(typed)) {
      return typed
        .map((p) => (typeof p.canonicalName === "string" ? p.canonicalName : ""))
        .filter(Boolean);
    }
    return [];
  })();

  const mustShowLocationSignals = Array.isArray(panelContract.mustShowLocationSignals)
    ? (panelContract.mustShowLocationSignals as string[])
    : [];

  const dialogueLines = (() => {
    const dialogues = meta.dialogues as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(dialogues)) {
      return dialogues
        .map((d) => (typeof d.text === "string" ? d.text : ""))
        .filter(Boolean);
    }
    const dialogue = meta.dialogue as string | undefined;
    return dialogue ? [dialogue] : [];
  })();

  const narrativeContext = (() => {
    const caption = img.panel.caption ?? (meta.caption as string | undefined) ?? null;
    return caption ? [caption] : [];
  })();

  return {
    pageIndex,
    panelIndex: img.panel.panelNumber ?? 0,
    subjectFocus,
    cutawayType,
    shotType,
    cameraAngle: img.panel.camera ?? null,
    mood: img.panel.mood ?? null,
    panelCharacterRoles,
    panelCharacterNames,
    npcPresence,
    npcGroupPresence,
    requiredProps,
    mustShowLocationSignals,
    dialogueLines,
    narrativeContext,
    beatType,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main builder
// ────────────────────────────────────────────────────────────────────────────

export function buildChapterImagePlanFromNarrative(
  input: NarrativeToPlanInput,
): NarrativeToPlanResult {
  // Groupement par sceneIndex pour produire un "beat" par scène (le pipeline
  // actuel utilise les scènes comme unités narratives).
  const bySceneIndex = new Map<number, NarrativePlannedImageLike[]>();
  for (const img of input.plannedImages) {
    const idx = img.sceneIndex ?? 0;
    const list = bySceneIndex.get(idx) ?? [];
    list.push(img);
    bySceneIndex.set(idx, list);
  }

  const beats: ChapterBeatPlanInput[] = [];
  let globalPageIndex = 0;
  let lastPageCountInBeat = 0;

  const sortedSceneIndexes = Array.from(bySceneIndex.keys()).sort((a, b) => a - b);
  for (let b = 0; b < sortedSceneIndexes.length; b++) {
    const sceneIdx = sortedSceneIndexes[b];
    const panels = bySceneIndex.get(sceneIdx) ?? [];

    // Utilise la première metadata pour déduire le beat / storyFunction.
    const firstMeta = panels[0]?.baseMetadata as Record<string, unknown> | undefined;
    const beatId =
      (firstMeta?.beatId as string | null | undefined) ?? `scene_${sceneIdx}_beat`;
    const beatType =
      (firstMeta?.beatType as string | null | undefined) ??
      ((firstMeta?.panelContract as Record<string, unknown> | undefined)?.beatType as
        | string
        | undefined) ??
      "scene";

    const panelInputs: ChapterPanelPlanInput[] = panels.map((img) => {
      const meta = img.baseMetadata as Record<string, unknown>;
      const pageFromMeta = typeof meta.pageNumber === "number" ? (meta.pageNumber as number) : null;
      const pageIndex = pageFromMeta ?? globalPageIndex + Math.floor(lastPageCountInBeat / 4);
      return mapPlannedImageToPanelInput(img, input.rawCharacters, pageIndex);
    });

    beats.push({
      beatId,
      beatIndex: b,
      beatType,
      beatTitle: `Scene ${sceneIdx}`,
      storyFunction:
        (firstMeta?.storyFunction as string | null | undefined) ?? "scene_arc",
      allocatedImages: panels.length,
      panels: panelInputs,
    });

    // Mise à jour de la page globale après le beat
    lastPageCountInBeat = panels.length;
    const maxPageInBeat = panelInputs.reduce((m, p) => Math.max(m, p.pageIndex), 0);
    globalPageIndex = Math.max(globalPageIndex, maxPageInBeat + 1);
  }

  const builderInput: ChapterImagePlanBuilderInput = {
    projectId: input.projectId,
    chapterId: input.chapterId,
    mangaStyleProfile: input.mangaStyleProfile,
    contentRating: input.contentRating,
    totalImageTarget: input.plannedImages.length,
    beats,
  };

  const plan = buildChapterImagePlan(builderInput);

  // Sur- ou sous-reconstitution : on garde la correspondance 1:1 par ordre
  // (plan[i] correspond à plannedImages[i]) pour pouvoir attacher les items
  // par `sceneImageId` ensuite.
  const planItemBySceneImageId = new Map<string, ChapterImagePlanItem>();
  for (let i = 0; i < input.plannedImages.length && i < plan.length; i++) {
    planItemBySceneImageId.set(input.plannedImages[i].sceneImageId, plan[i]);
  }

  const validation = validateChapterImagePlan(plan, Math.min(60, plan.length), 80);

  return { plan, validation, planItemBySceneImageId };
}

/**
 * Helper utilitaire pour déduire un rating à partir d'un projet Prisma.
 */
export function deriveContentRatingFromProject(project: {
  intensityLayer?: string | null;
  settings?: { contentRating?: string | null } | null;
}): ContentRating {
  const explicit = project.settings?.contentRating ?? project.intensityLayer ?? "";
  return normalizeRating(explicit);
}

/**
 * Helper : dérive le profil de style manga à partir du projet / style pack.
 */
export function deriveMangaStyleProfileFromStylePack(stylePacks: Array<{ name?: string | null }>): string {
  const first = stylePacks[0];
  if (first?.name) return first.name;
  return "shonen_classic";
}

/**
 * Sanity check : vérifie qu'un `ImageIntentType` revient bien dans le plan.
 * Utilisé par les tests.
 */
export function countIntentInPlan(
  plan: ChapterImagePlanItem[],
  intent: ImageIntentType,
): number {
  return plan.filter((p) => p.imageIntentType === intent).length;
}
