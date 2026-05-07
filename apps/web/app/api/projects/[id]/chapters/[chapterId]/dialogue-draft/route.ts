/**
 * P0 (mai 2026) — Génération des dialogues IA AVANT le launch.
 *
 * Le dialoguiste IA tournait jusqu'ici uniquement pendant la pipeline premium :
 * l'utilisateur ne voyait jamais les bulles avant la génération des images.
 * Cette route permet au wizard "Script & Dialogues" de :
 *   1. récupérer les blueprints du `productionPlan`
 *   2. appeler le dialoguiste IA en mode strict (`rejectUnresolvedSpeakers`)
 *   3. enrichir les blueprints avec `dialogueLines.characterId`
 *   4. construire/mettre à jour `chapterDialogueContract`
 *   5. valider en mode premium (`SPEAKER_NOT_IDENTIFIED` -> error)
 *   6. persister le résultat dans `outline.studio` (snapshot)
 *   7. retourner stats + lignes par panel pour l'UI
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildDialogueContractFromBlueprints,
  chapterStudioDataSchema,
  isPipelineV3PremiumOnlyEnabled,
  isPremiumStrictMode,
  normalizePremiumBlueprintTextViews,
  validateDialogueContract,
  type DialogueContract,
  type DialogueContractValidationResult,
  type PanelBlueprintPremium,
  type ProductionOutline,
} from "@manga-ai-studio/core";
import {
  enrichPremiumBlueprintsSceneDialogue,
  type EnrichPremiumBlueprintsSceneDialogueResult,
} from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedChapter } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  mergeChapterStudioIntoOutline,
  patchChapterStudioSnapshot,
  readChapterStudioSnapshotFromOutline,
} from "@/lib/chapter-studio";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const bodySchema = z.object({
  /** Si true (défaut): valide en mode strict premium même hors PREMIUM_ONLY. */
  strictPremium: z.boolean().optional(),
  /** Force la passe scene-dialogue même si OPENAI_SCENE_DIALOGUE_ENRICH n'est pas à 1. */
  force: z.boolean().optional().default(true),
});

type DialogueDraftPanelView = {
  panelId: string;
  pageNumber: number | null;
  panelNumber: number | null;
  speakerId: string | null;
  speakerName: string | null;
  text: string;
  speakerVisible: boolean;
};

type DialogueDraftResponse = {
  ok: boolean;
  chapterId: string;
  enrichResult: EnrichPremiumBlueprintsSceneDialogueResult;
  contract: DialogueContract;
  validation: DialogueContractValidationResult;
  panels: DialogueDraftPanelView[];
  /** Codes erreur premium prêts à afficher en UI. */
  premiumErrors: string[];
  /** `true` si la persistance a écrit le snapshot. */
  persisted: boolean;
};

function uniquePush<T>(arr: T[], v: T): void {
  if (!arr.includes(v)) arr.push(v);
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const rl = await checkRateLimit(user.id, "chapter-dialogue-draft");
  if (!rl.ok) {
    return NextResponse.json(
      { error: rl.message, code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide.", code: "BAD_BODY" }, { status: 400 });
  }

  const premiumOnly = isPipelineV3PremiumOnlyEnabled();
  const strict = body.strictPremium ?? premiumOnly ?? isPremiumStrictMode();

  const snapshot = readChapterStudioSnapshotFromOutline({
    outline: chapter.outline,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    chapterSummary: chapter.summary,
    cliffhanger: chapter.cliffhanger,
    userIntent: chapter.userIntent,
    studioStatus: chapter.studioStatus,
    studioCurrentStep: chapter.studioCurrentStep,
    studioUpdatedAt: chapter.studioUpdatedAt,
    studioAutosaveVersion: chapter.studioAutosaveVersion,
    minimumImages: chapter.minimumImages,
    generatedImages: chapter.generatedImages,
    acceptedImages: chapter.acceptedImages,
    rejectedImages: chapter.rejectedImages,
    missingImages: chapter.missingImages,
    criticalPanelsCount: chapter.criticalPanelsCount,
    criticalPanelsBlocked: chapter.criticalPanelsBlocked,
    criticalPanelsMissingQa: chapter.criticalPanelsMissingQa,
    reviewBlockedReason: chapter.reviewBlockedReason,
  });
  const data = chapterStudioDataSchema.parse(snapshot.data);

  // Le schéma Zod infère un type plus large que `PanelBlueprintPremium`
  // (subjectFocus: string vs SubjectFocus). On cast après lecture parsée :
  // les valeurs persistées proviennent du même builder typé côté pipeline.
  const blueprints: PanelBlueprintPremium[] | undefined =
    data.productionPlan?.panelBlueprints as PanelBlueprintPremium[] | undefined;
  if (!blueprints || blueprints.length === 0) {
    return NextResponse.json(
      {
        error:
          "Aucun panel n'a encore été planifié. Génère d'abord le plan du chapitre, puis reviens ici pour les dialogues.",
        code: "DIALOGUE_DRAFT_NO_PLAN",
      },
      { status: 409 },
    );
  }

  const characters = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true, roleType: true },
    orderBy: { createdAt: "asc" },
  });
  const characterNameById: Record<string, string> = {};
  const knownCharacterIds: string[] = [];
  for (const c of characters) {
    characterNameById[c.id] = c.name;
    knownCharacterIds.push(c.id);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { primaryGenre: true, tone: true, contentRating: true },
  });

  const productionOutline: ProductionOutline | null = data.productionOutline ?? null;

  const writableBlueprints: PanelBlueprintPremium[] = blueprints.map((bp) => ({ ...bp }));

  const enrichResult = await enrichPremiumBlueprintsSceneDialogue({
    blueprints: writableBlueprints,
    productionOutline,
    chapterSummary: chapter.summary ?? null,
    chapterUserIntent: chapter.userIntent ?? null,
    characterNameById,
    projectGenre: data.chapterIntentContract?.tone ?? project?.primaryGenre ?? null,
    projectTone: data.chapterIntentContract?.tone ?? project?.tone ?? null,
    contentRating: project?.contentRating ?? null,
    forceSceneDialogueEnrich: body.force === true,
    rejectUnresolvedSpeakers: strict,
  });

  const normalized = writableBlueprints.map((bp) => normalizePremiumBlueprintTextViews(bp));
  const contract = buildDialogueContractFromBlueprints(chapterId, normalized, characterNameById);

  const panelIds = normalized.map((bp) => bp.panelId);
  const validation = validateDialogueContract(contract, {
    panelIds,
    characterIds: knownCharacterIds,
    strictMode: strict,
  });

  const premiumErrors: string[] = [];
  if (strict) {
    for (const issue of validation.issues) {
      if (issue.severity === "error") {
        uniquePush(premiumErrors, `${issue.code}:${issue.panelId ?? "?"}`);
      }
    }
    for (const e of enrichResult.blockingErrors) {
      uniquePush(premiumErrors, e);
    }
  }

  const blueprintByPanelId = new Map(normalized.map((bp) => [bp.panelId, bp] as const));

  const panels: DialogueDraftPanelView[] = contract.lines.map((line) => {
    const bp = blueprintByPanelId.get(line.panelId);
    return {
      panelId: line.panelId,
      pageNumber: bp?.pageNumber ?? null,
      panelNumber: bp?.panelNumber ?? null,
      speakerId: line.speakerId === "unknown" ? null : line.speakerId,
      speakerName: line.speakerName ?? null,
      text: line.text,
      speakerVisible: line.speakerVisible,
    };
  });

  let persisted = false;
  if (premiumErrors.length === 0) {
    const updatedSnapshot = patchChapterStudioSnapshot(
      chapter.outline,
      {
        productionPlan: {
          ...(data.productionPlan!),
          panelBlueprints: normalized,
        },
        chapterDialogueContract: contract,
      },
      {
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.title,
        chapterSummary: chapter.summary,
        cliffhanger: chapter.cliffhanger,
        userIntent: chapter.userIntent,
        transitionReason: "dialogue_draft_generated",
      },
    );

    const mergedOutline = mergeChapterStudioIntoOutline({
      outline: chapter.outline,
      snapshot: updatedSnapshot,
    });

    await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        outline: mergedOutline as never,
        studioUpdatedAt: new Date(),
      },
    });
    persisted = true;
  } else {
    console.warn(
      `[dialogue-draft] not_persisted chapterId=${chapterId} errors=${premiumErrors.slice(0, 3).join("|")}`,
    );
  }

  const response: DialogueDraftResponse = {
    ok: premiumErrors.length === 0,
    chapterId,
    enrichResult,
    contract,
    validation,
    panels,
    premiumErrors,
    persisted,
  };

  console.info(
    `[dialogue-draft] chapterId=${chapterId} lines=${contract.totalLines} ` +
      `panels=${contract.panelsWithDialogue} errors=${premiumErrors.length} persisted=${persisted} strict=${strict}`,
  );

  return NextResponse.json(response, { status: response.ok ? 200 : 422 });
}
