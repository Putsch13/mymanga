/**
 * P5.2 — Génération du bundle estimate + ré-alignement Visual World.
 *
 * Étape 1 (legacy autorisé) : `generateChapterBundle` sans VisualWorldContract,
 * ce qui pose les beats narratifs.
 * Étape 2 (premium-only + OPENAI_API_KEY) : compose le `VisualWorldContract` à
 * partir des beats produits, puis relance `generateChapterBundle` avec ce
 * contrat injecté pour aligner décors / props / NPC sur la canon visuelle.
 *
 * Si la composition VW échoue, on log et on garde le bundle initial (le strict
 * v3 sera vérifié plus loin).
 */
import {
  composeVisualWorldContract,
  generateChapterBundle,
  toComposeVisualWorldKnownLocation,
} from "@manga-ai-studio/ai";
import {
  buildApprovedChapterOutlineReplayFromOutlineBeats,
  isPipelineV3PremiumOnlyEnabled,
} from "@manga-ai-studio/core";
import { prisma } from "@manga-ai-studio/db";

type GenerateChapterBundleArgs = Parameters<typeof generateChapterBundle>[0];
type GenerateChapterBundleResult = Awaited<ReturnType<typeof generateChapterBundle>>;

export async function prepareEstimateBundle(args: {
  projectId: string;
  estimateChapterId: string;
  targetChapter: { id: string; title: string | null } | null;
  targetChapterNumber: number;
  userIntent: string;
  selectedPlotLabel: GenerateChapterBundleArgs["selectedPlotLabel"];
  creativityControls: GenerateChapterBundleArgs["creativityControls"];
  context: GenerateChapterBundleArgs["context"];
}): Promise<GenerateChapterBundleResult> {
  const {
    projectId,
    estimateChapterId,
    targetChapter,
    targetChapterNumber,
    userIntent,
    selectedPlotLabel,
    creativityControls,
    context,
  } = args;

  let bundle = await generateChapterBundle({
    chapterId: targetChapter?.id,
    chapterNumber: targetChapterNumber,
    chapterTitle: targetChapter?.title ?? null,
    userIntent,
    selectedPlotLabel,
    creativityControls,
    context,
    // Avant `composeVisualWorldContract` : pas encore de VW → autoriser le pool
    // legacy sur ce seul appel pour ne pas faire échouer la génération initiale.
    allowLegacyLocationInference: isPipelineV3PremiumOnlyEnabled() ? true : undefined,
  });

  if (!process.env.OPENAI_API_KEY || !isPipelineV3PremiumOnlyEnabled()) {
    return bundle;
  }

  try {
    const [charactersForWorld, locationsForWorld, knownNpcGroupsForWorld, knownPropsForWorld]
      = await Promise.all([
        prisma.character.findMany({
          where: { projectId },
          select: { id: true, name: true, roleType: true, appearance: true },
        }),
        prisma.location.findMany({
          where: { projectId },
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
            visualBrief: true,
            establishedVisualBrief: true,
            canonImageUrl: true,
            canonLocked: true,
            metadata: true,
            visualRefs: true,
          },
        }),
        // P0 USER-WINS : passer les NPC groups projet déjà détectés/édités au
        // LLM pour qu'il réutilise leurs id/label.
        prisma.npcGroup.findMany({
          where: { projectId },
          select: {
            id: true,
            label: true,
            description: true,
            visualProfile: true,
            outfit: true,
            silhouette: true,
            userEdited: true,
          },
        }),
        prisma.worldProp.findMany({
          where: { projectId },
          select: {
            id: true,
            label: true,
            visualDescription: true,
            userEdited: true,
          },
        }),
      ]);

    const nameToId = new Map(
      charactersForWorld.map((c) => [c.name.trim().toLowerCase(), c.id] as const),
    );

    const vw = await composeVisualWorldContract({
      chapterId: estimateChapterId,
      chapterSummary: bundle.outline.chapter_goal,
      chapterUserIntent: userIntent,
      projectGenre: context.project.primaryGenre ?? null,
      projectTone: context.project.tone ?? null,
      styleBibleJson: null,
      beats: bundle.outline.beats.map((b) => ({
        beatId: b.id,
        summary: b.summary,
        whyThisBeatExists: b.pageRole ?? null,
        dramaticChange: b.turn ?? b.purpose,
        involvedCharacterIds: (b.characters ?? [])
          .map((name) => nameToId.get(String(name).trim().toLowerCase()))
          .filter((x): x is string => Boolean(x)),
      })),
      knownCharacters: charactersForWorld.map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.roleType ?? null,
        description: c.appearance ?? null,
      })),
      knownLocations: locationsForWorld.map((loc) => toComposeVisualWorldKnownLocation(loc)),
      knownNpcGroups: knownNpcGroupsForWorld.map((g) => ({
        id: g.id,
        label: g.label,
        description: g.description ?? null,
        visualProfile: g.visualProfile ?? null,
        outfit: g.outfit ?? null,
        silhouette: g.silhouette ?? null,
        userEdited: g.userEdited,
      })),
      knownWorldProps: knownPropsForWorld.map((p) => ({
        id: p.id,
        label: p.label,
        visualDescription: p.visualDescription ?? null,
        userEdited: p.userEdited,
      })),
    });

    const approvedReplay = buildApprovedChapterOutlineReplayFromOutlineBeats({
      summary: bundle.outline.chapter_goal,
      cliffhanger: bundle.outline.cliffhanger,
      source: "estimate_preview",
      beats: bundle.outline.beats.map((beat) => ({
        id: beat.id,
        summary: beat.summary,
        characters: beat.characters,
        location: beat.location,
        pageRole: beat.pageRole ?? "escalation",
        turn: beat.turn ?? beat.purpose,
        emotionalDelta: beat.emotionalDelta ?? 0,
        structuredBeat: beat.structuredBeat ?? null,
      })),
    });

    bundle = await generateChapterBundle({
      chapterId: targetChapter?.id,
      chapterNumber: targetChapterNumber,
      chapterTitle: targetChapter?.title ?? null,
      userIntent,
      selectedPlotLabel,
      creativityControls,
      context,
      approvedOutline: approvedReplay,
      visualWorldContract: vw,
      // VW présent : en premium, liaisons beat→lieu strictes.
      allowLegacyLocationInference: isPipelineV3PremiumOnlyEnabled() ? false : undefined,
    });
  } catch (vwAlignErr) {
    console.warn("[estimate] visual_world_bundle_realign_failed", vwAlignErr);
  }

  return bundle;
}
