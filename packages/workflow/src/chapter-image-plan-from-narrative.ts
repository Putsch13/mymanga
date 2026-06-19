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
  canonicalizeCharacterRoleType,
  synthesizePanelTextContractFromLooseMetadata,
  textContractToLegacyDialogue,
  type PanelTextContract,
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

/**
 * P2.1 — on delegue la normalisation a `canonicalizeCharacterRoleType` (core)
 * pour eviter les regex locales qui divergent entre modules. On conserve le
 * signature historique (`hero | enemy | ally | npc | other`) pour ne pas
 * casser les callers, mais la logique de reconnaissance est unique.
 */
function roleTypeToRole(
  roleType: string | null | undefined,
): "hero" | "enemy" | "ally" | "npc" | "other" {
  const canonical = canonicalizeCharacterRoleType(roleType);
  switch (canonical) {
    case "hero":
      return "hero";
    case "antagonist":
    case "rival":
      return "enemy";
    case "ally":
    case "support":
    case "secondary":
      return "ally";
    case "npc":
    case "recurring_npc":
      return "npc";
    default:
      return "other";
  }
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
    const contract: PanelTextContract = synthesizePanelTextContractFromLooseMetadata(
      meta,
      String(meta.panelId ?? "n"),
    );
    return textContractToLegacyDialogue(contract)
      .map((d) => d.text.trim())
      .filter(Boolean);
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

  // P1.3 — mapping stable sceneImageId → planItem.
  //
  // Strategie :
  //   1. On construit une cle deterministe `${pageIndex}|${panelIndex}|${beatId?}`
  //      a partir de `baseMetadata` pour chaque plannedImage.
  //   2. On tente de matcher chaque plannedImage sur le planItem ayant la meme
  //      cle.
  //   3. En fallback (cle partielle ou collision), on rebascule sur l'ordre
  //      des tableaux en tracant l'evenement.
  //
  // Si les cardinalites different, on jette explicitement pour ne pas laisser
  // passer un mapping silencieusement decale.
  const planItemBySceneImageId = buildStablePlanItemMap(input.plannedImages, plan);

  const validation = validateChapterImagePlan(plan, Math.min(60, plan.length), 80);

  return { plan, validation, planItemBySceneImageId };
}

/**
 * P1.3 — jointure stable sceneImageId ↔ planItem, avec fallback ordre si la
 * cle composite n'est pas disponible. Expose via export pour tests cibles.
 */
export function buildStablePlanItemMap(
  plannedImages: ReadonlyArray<NarrativePlannedImageLike>,
  plan: ReadonlyArray<ChapterImagePlanItem>,
): Map<string, ChapterImagePlanItem> {
  const map = new Map<string, ChapterImagePlanItem>();

  if (plannedImages.length === 0) return map;

  if (plannedImages.length !== plan.length) {
    // On refuse de bricoler un mapping partiel : le reste du pipeline va lire
    // ce Map et traiter les entrees manquantes comme des bugs silencieux.
    throw new Error(
      `chapter-image-plan-from-narrative: cardinality_mismatch plannedImages=${plannedImages.length} plan=${plan.length}`,
    );
  }

  // Construit un index `key → planItem index` pour les lookups deterministes.
  const planIndexByKey = new Map<string, number>();
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const key = makePlanItemKey(p.pageIndex, p.panelIndex, p.beatId);
    if (!planIndexByKey.has(key)) {
      planIndexByKey.set(key, i);
    }
  }

  let stableMatches = 0;
  let orderFallbacks = 0;
  for (let i = 0; i < plannedImages.length; i++) {
    const planned = plannedImages[i];
    const joinKey = deriveJoinKeyFromPlanned(planned);
    let matchedPlanItem: ChapterImagePlanItem | undefined;
    if (joinKey) {
      const idx = planIndexByKey.get(joinKey);
      if (idx !== undefined) {
        matchedPlanItem = plan[idx];
        stableMatches++;
      }
    }
    if (!matchedPlanItem) {
      matchedPlanItem = plan[i];
      orderFallbacks++;
    }
    map.set(planned.sceneImageId, matchedPlanItem);
  }

  if (orderFallbacks > 0) {
    console.warn(
      `[chapter-image-plan] stable_mapping_partial stable=${stableMatches} orderFallbacks=${orderFallbacks} total=${plannedImages.length}`,
    );
  }

  return map;
}

function makePlanItemKey(
  pageIndex: number | null | undefined,
  panelIndex: number | null | undefined,
  beatId: string | null | undefined,
): string {
  return `${pageIndex ?? "?"}|${panelIndex ?? "?"}|${beatId ?? "?"}`;
}

function deriveJoinKeyFromPlanned(
  planned: NarrativePlannedImageLike,
): string | null {
  const meta = planned.baseMetadata ?? {};
  const pageIndex = pickNumber(meta.pageIndex) ?? pickNumber(meta.page);
  const panelIndex =
    pickNumber(meta.panelIndex)
    ?? pickNumber(planned.panel?.panelNumber)
    ?? null;
  const beatId =
    pickString(meta.beatId) ?? pickString(meta.sourceBeatId) ?? null;

  if (pageIndex == null && panelIndex == null && beatId == null) {
    return null;
  }
  return makePlanItemKey(pageIndex, panelIndex, beatId);
}

function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
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
