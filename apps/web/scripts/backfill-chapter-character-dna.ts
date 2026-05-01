#!/usr/bin/env tsx
/**
 * Backfill des blueprints studio sur un chapitre (aligné estimate / launch premium) :
 * 1. `characterVisualDna` depuis personnages + `characterCanons`
 * 2. Si `visualWorldContract` est présent dans le snapshot : `environmentVisualDna` + NPC/props VW
 * 3. Preflight continuité strict si premium-only **ou** `isPremiumStrictMode()` — **exit 1** si blockers
 *
 * Usage :
 *   pnpm exec tsx apps/web/scripts/backfill-chapter-character-dna.ts [chapterId]
 *   pnpm exec tsx apps/web/scripts/backfill-chapter-character-dna.ts --chapterId=xxx
 *   pnpm exec tsx apps/web/scripts/backfill-chapter-character-dna.ts --dryRun
 *
 * Défaut chapterId : cmoi8r3l30001pi2944d8ib11
 */

import {
  hydrateBlueprintsWithCharacterDna,
  hydrateBlueprintsWithEnvironmentDna,
  hydrateBlueprintsWithNpcDna,
  hydrateBlueprintsWithPropDna,
  parseVisualWorldContract,
  type CharacterCanon,
  type PanelBlueprintPremium,
  computePanelContinuityPreflights,
  continuityPreflightBlockingReasons,
  isPipelineV3PremiumOnlyEnabled,
  isPremiumStrictMode,
} from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { readChapterStudioSnapshotFromOutline, patchChapterStudioSnapshot } from "../lib/chapter-studio/snapshot";
import { premiumCharacterStudioSelect, toCharacterRowsForDnaHydration } from "../lib/premium-character-studio-select";

const DEFAULT_CHAPTER_ID = "cmoi8r3l30001pi2944d8ib11";

function parseChapterIdFromArgv(): string {
  const raw = process.argv.slice(2);
  for (const a of raw) {
    if (a.startsWith("--chapterId=")) {
      const v = a.slice("--chapterId=".length).trim();
      if (v) return v;
    }
  }
  const pos = raw.find((x) => x && !x.startsWith("--"));
  return (pos?.trim() || DEFAULT_CHAPTER_ID).trim();
}

function argvHasDryRun(): boolean {
  return process.argv.slice(2).some((a) => a === "--dryRun" || a === "--dry-run");
}

async function main() {
  const chapterId = parseChapterIdFromArgv();
  const dryRun = argvHasDryRun();
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      project: true,
    },
  });
  if (!chapter) {
    console.error(`[backfill] chapter not found: ${chapterId}`);
    process.exit(1);
  }

  const characterRows = await prisma.character.findMany({
    where: { projectId: chapter.projectId },
    select: premiumCharacterStudioSelect,
  });

  const snapshot = readChapterStudioSnapshotFromOutline({
    outline: chapter.outline,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
  });
  const plan = snapshot.data.productionPlan;
  const bps = plan?.panelBlueprints;
  if (!Array.isArray(bps) || bps.length === 0) {
    console.error(`[backfill] no panelBlueprints on chapter ${chapterId}`);
    process.exit(1);
  }

  const canons = snapshot.data.characterCanons ?? [];
  const characterCanonsById = new Map<string, CharacterCanon>(
    canons.map((c) => [c.characterId, c] as const),
  );

  const strictSession = isPipelineV3PremiumOnlyEnabled() || isPremiumStrictMode();
  let pipeline = hydrateBlueprintsWithCharacterDna({
    blueprints: bps as PanelBlueprintPremium[],
    characters: toCharacterRowsForDnaHydration(characterRows),
    characterCanonsById,
    characterCanons: canons.length > 0 ? canons : null,
    strict: strictSession,
    ...(typeof snapshot.data.characterSelection?.secondaryHeroCharacterId === "string"
      && snapshot.data.characterSelection.secondaryHeroCharacterId.trim().length > 0
      ? {
          coProtagonistCharacterIds: [snapshot.data.characterSelection.secondaryHeroCharacterId.trim()] as const,
        }
      : {}),
  });

  const rawVw = (snapshot.data as { visualWorldContract?: unknown }).visualWorldContract;
  if (rawVw !== undefined && rawVw !== null) {
    try {
      const vw = parseVisualWorldContract(rawVw);
      const strictVw = strictSession;
      pipeline = hydrateBlueprintsWithEnvironmentDna({
        blueprints: pipeline,
        visualWorld: vw,
        strict: strictVw,
      });
      pipeline = hydrateBlueprintsWithPropDna({
        blueprints: pipeline,
        visualWorld: vw,
        strict: strictVw,
      });
      pipeline = hydrateBlueprintsWithNpcDna({
        blueprints: pipeline,
        visualWorld: vw,
        strict: strictVw,
      });
      console.log(
        `[backfill] visual_world_hydration ok locations=${vw.locations.length} props=${vw.props?.length ?? 0} npcGroups=${vw.npcGroups?.length ?? 0}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[backfill] visual_world_hydration_skipped reason=${msg.slice(0, 200)}`);
    }
  }

  let continuityBlockers: string[] = [];
  if (strictSession) {
    const preflights = computePanelContinuityPreflights(pipeline, {
      strictEnvironmentLocationBinding: true,
      strictCharacterDnaBinding: true,
      strictPropVisualBinding: true,
    });
    continuityBlockers = continuityPreflightBlockingReasons(preflights);
    console.log(
      `[backfill] continuity_preflight panels=${preflights.length} blockers=${continuityBlockers.length}`,
    );
    if (continuityBlockers.length > 0) {
      console.error(
        `[backfill] continuity_blockers (exit 1) sample=${JSON.stringify(continuityBlockers.slice(0, 12))}`,
      );
      process.exit(1);
    }
  }

  if (dryRun) {
    console.log(
      `[backfill] dryRun=true — hydratation calculée, blockers=${continuityBlockers.length}, aucune écriture DB`,
    );
    process.exit(0);
  }

  const nextStudio = patchChapterStudioSnapshot(
    chapter.outline,
    {
      productionPlan: {
        ...(plan as Record<string, unknown>),
        panelBlueprints: pipeline,
      },
    },
    {
      chapterNumber: chapter.chapterNumber,
      chapterTitle: chapter.title,
    },
  );

  const outlineRec = (chapter.outline ?? {}) as Record<string, unknown>;

  await prisma.chapter.update({
    where: { id: chapterId },
    data: {
      outline: {
        ...outlineRec,
        studio: nextStudio,
      } as Prisma.InputJsonValue,
    },
  });

  console.log(
    `[backfill] ok chapterId=${chapterId} panels=${pipeline.length} projectId=${chapter.projectId}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
