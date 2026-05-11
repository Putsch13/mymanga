/**
 * render-pass-persist.ts
 *
 * Phase finale : persistance fail-hard des panels rendus en SceneImage.
 * Vérifie que tous les `panelId` attendus sont effectivement persistés
 * (cf. AUDIT-V8 — pas de "71/71 muet"). Extrait de `render-pass.ts`
 * (audit-v9).
 */

import { startChapterImageGenerationRun } from "../persistence/chapter-generation-run";
import {
  persistV3RenderedPanels,
  type V3RenderedPanelRecord,
} from "../persistence/v3-scene-image-persistence";
import type { StoryboardPlan } from "@manga-ai-studio/ai";
import { isPipelineV3PremiumOnlyEnabled } from "@manga-ai-studio/core";
import {
  V3ImagePersistenceError,
  type RenderedPanelDescriptor,
} from "./render-pass-types";

/**
 * FIX-32 (MOD) — En premium, un panel "skipped en preflight" n'est PAS
 * un comportement attendu : ça veut dire qu'un blueprint était cassé au
 * point qu'on n'a même pas pu envoyer la requête fal. Avant ce TODO ces
 * skips étaient simplement loggés en warning ("non-blocking"), ce qui
 * faisait passer un chapitre incomplet en "ready_for_render" alors qu'il
 * manquait des panels critiques. On promeut ces skips en erreur dure.
 */
export class PremiumPreflightSkippedPanelsError extends Error {
  override name = "PremiumPreflightSkippedPanelsError" as const;
  constructor(
    public readonly chapterId: string,
    public readonly skippedPanelIds: string[],
  ) {
    super(
      `premium_preflight_panels_skipped chapter=${chapterId} ` +
        `count=${skippedPanelIds.length} ids=${skippedPanelIds.slice(0, 10).join(",")}`,
    );
  }
}

export interface PersistRenderedInput {
  chapterId: string;
  storyboardPlan: StoryboardPlan;
  rendered: RenderedPanelDescriptor[];
  generationRunId: string | null;
  preflightErrors: Array<{ panelId: string; error: string }>;
}

export interface PersistRenderedResult {
  warnings: string[];
}

export async function persistRendered(
  input: PersistRenderedInput,
): Promise<PersistRenderedResult> {
  const { chapterId, storyboardPlan, rendered, preflightErrors } = input;
  const warnings: string[] = [];

  if (rendered.length === 0) return { warnings };

  const expectedPanelIds = rendered.map((r) => r.spec.panelId);
  let persistResult;

  let generationRunId = input.generationRunId;
  if (!generationRunId) {
    const runStart = await startChapterImageGenerationRun(chapterId);
    generationRunId = runStart.runId;
    console.info(
      `[render-pass:generation-run] chapterId=${chapterId} runId=${generationRunId} ` +
        `deletedUnvalidated=${runStart.deletedCount}`,
    );
  }

  try {
    persistResult = await persistV3RenderedPanels({
      chapterId,
      storyboardPlan,
      rendered: rendered as V3RenderedPanelRecord[],
      generationRunId,
    });
    console.log(
      `[render-pass:persist] chapterId=${chapterId} scenesCreated=${persistResult.scenesCreated} scenesReused=${persistResult.scenesReused} imagesUpserted=${persistResult.imagesUpserted} imagesSkipped=${persistResult.imagesSkipped} persistedUnique=${new Set(persistResult.persistedPanelIds ?? []).size}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[render-pass:persist] persist_failed chapterId=${chapterId} error=${msg}`,
    );
    throw new V3ImagePersistenceError({
      chapterId,
      expectedPanels: expectedPanelIds.length,
      persistedPanels: 0,
      missingPanels: expectedPanelIds,
      cause: err instanceof Error ? err : undefined,
    });
  }

  // AUDIT-V8 — Vérification stricte basée sur les `panelId` réels.
  //
  // Ancien bug : on comparait `expectedPanels.length` à `imagesUpserted`,
  // qui pouvait être égal (ex. 71/71) alors qu'un panel n'avait pas été
  // couvert (parce que deux upserts s'écrasaient sur le même slot).
  //
  // Nouveau check :
  //   1. expectedPanelIds = panels du storyboard
  //   2. persistedUniquePanelIds = Set des panelId réellement upsertés
  //   3. missing = expected ∖ persisted
  //   4. extra   = persisted ∖ expected
  //   5. preflight skips = warnings non bloquants
  //
  // Plus AUCUN compteur "skipped" muet : chaque skip a un `skipReason`
  // serializable et tracé.
  const preflightSkippedIds = new Set(preflightErrors.map((e) => e.panelId));
  const expectedSet = new Set(expectedPanelIds);
  // Backwards-compat : les anciens mocks de tests ne renvoient pas
  // persistedPanelIds / skippedPanelIds. Defaults vides → on retombe
  // sur l'ancien comportement basé sur warnings (pour les unit tests).
  const persistedPanelIdsList = persistResult.persistedPanelIds ?? [];
  const skippedPanelIdsList = persistResult.skippedPanelIds ?? [];
  const persistedUniqueSet = new Set(persistedPanelIdsList);

  const missing = expectedPanelIds.filter((id) => !persistedUniqueSet.has(id));
  const extra = [...persistedUniqueSet].filter((id) => !expectedSet.has(id));

  // Sépare les "skipped explicables" (preflight) des skips inattendus
  const unexpectedSkips = skippedPanelIdsList.filter(
    (s) => !preflightSkippedIds.has(s.panelId),
  );

  // Si on n'a pas de persistedPanelIds (ancien mock), on retombe sur
  // l'ancien check : interrogations sur les warnings.
  const legacyMode = persistedPanelIdsList.length === 0 && expectedPanelIds.length > 0;
  let realMissing: string[];
  if (legacyMode) {
    const storageMissing = (persistResult.warnings ?? [])
      .filter((w) => w.startsWith("storage_failed"))
      .map((w) => w.match(/panelId=([^\s]+)/)?.[1] ?? "unknown");
    const unexpectedSkipsLegacy = (persistResult.warnings ?? [])
      .filter((w) => w.startsWith("panel_not_rendered"))
      .map((w) => w.match(/panelId=([^\s]+)/)?.[1] ?? "unknown")
      .filter((id) => !preflightSkippedIds.has(id));
    realMissing = [...storageMissing, ...unexpectedSkipsLegacy];
  } else {
    realMissing = missing.filter((id) => !preflightSkippedIds.has(id));
  }
  const hasStorageFailure = persistResult.imagesStorageFailed > 0;

  if (realMissing.length > 0 || extra.length > 0 || hasStorageFailure) {
    console.error(
      `[render-pass:persist] incomplete chapterId=${chapterId} ` +
        `expected=${expectedPanelIds.length} persistedUnique=${persistedUniqueSet.size} ` +
        `realMissing=${realMissing.length} extra=${extra.length} ` +
        `storageFailed=${persistResult.imagesStorageFailed} ` +
        `preflightSkipped=${preflightSkippedIds.size} unexpectedSkips=${unexpectedSkips.length}`,
    );
    if (realMissing.length > 0) {
      console.error(
        `[render-pass:persist] missing_ids=${JSON.stringify(realMissing.slice(0, 10))}`,
      );
    }
    if (extra.length > 0) {
      console.error(
        `[render-pass:persist] extra_ids=${JSON.stringify(extra.slice(0, 10))}`,
      );
    }
    if (unexpectedSkips.length > 0) {
      console.error(
        `[render-pass:persist] unexpected_skips=` +
          JSON.stringify(unexpectedSkips.slice(0, 10)),
      );
    }

    throw new V3ImagePersistenceError({
      chapterId,
      expectedPanels: expectedPanelIds.length,
      persistedPanels: persistedUniqueSet.size,
      missingPanels: realMissing.length > 0 ? realMissing : missing,
      extraPanels: extra,
    });
  }

  if (persistResult.imagesSkipped > 0) {
    console.warn(
      `[render-pass:persist] chapterId=${chapterId} ` +
        `${persistResult.imagesSkipped} panel(s) skipped (all from preflight) — non-blocking ` +
        `ids=${JSON.stringify(skippedPanelIdsList.slice(0, 5))}`,
    );

    // FIX-32 — promu en erreur bloquante en premium.
    if (isPipelineV3PremiumOnlyEnabled() && preflightSkippedIds.size > 0) {
      throw new PremiumPreflightSkippedPanelsError(
        chapterId,
        [...preflightSkippedIds],
      );
    }
  }

  if (persistResult.warnings.length > 0) {
    console.warn(
      `[render-pass:persist] warnings=${persistResult.warnings.slice(0, 5).join(" | ")}`,
    );
    warnings.push(...persistResult.warnings);
  }

  return { warnings };
}
