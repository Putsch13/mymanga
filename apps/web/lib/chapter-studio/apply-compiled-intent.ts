/**
 * apply-compiled-intent — persistance partagée d'une intention compilée.
 *
 * Source de vérité unique utilisée par `/intent-compile` ET `/interview` pour
 * garantir QU'AUCUN des deux ne diverge sur :
 *   1. la persistance du `chapterIntentContract` + `intentNarrativeContract`
 *      dans le snapshot studio (lu par readiness, launch, dialogue-writer…) ;
 *   2. l'extraction + upsert USER-WINS des entités monde (NPC groups, props)
 *      depuis l'intention brute.
 *
 * Avant cette extraction, l'interviewer conversationnel perdait silencieusement
 * le narrativeContract et la création des PNJ/props — régression de fiabilité.
 */
import { prisma } from "@manga-ai-studio/db";
import type {
  ChapterIntentContract,
  ChapterStudioData,
  IntentNarrativeContract,
} from "@manga-ai-studio/core";
import { extractWorldEntitiesFromIntent } from "@manga-ai-studio/ai";
import { patchChapterStudioSnapshot } from "@/lib/chapter-studio";
import { toPrismaInputJson } from "@/lib/to-prisma-input-json";
import { upsertWorldEntities } from "@/lib/world-entities/upsert-world-entities";

export interface WorldEntitiesResult {
  npcGroupsCreated: number;
  npcGroupsUpdated: number;
  npcGroupsSkippedUserEdited: number;
  worldPropsCreated: number;
  worldPropsUpdated: number;
  worldPropsSkippedUserEdited: number;
  source: "openai" | "heuristic_fallback";
  warnings: string[];
}

export interface ApplyCompiledIntentInput {
  chapter: {
    id: string;
    outline: unknown;
    chapterNumber: number;
    title: string | null;
    summary: string | null;
    cliffhanger: string | null;
    userIntent: string | null;
  };
  projectId: string;
  contract: ChapterIntentContract;
  narrativeContract: IntentNarrativeContract | null;
  rawUserIntent: string;
  transitionReason: string;
  /**
   * Patch studio additionnel fusionné dans le même snapshot (ex. sélection
   * de cast auto-dérivée par l'interviewer). Optionnel.
   */
  extraStudioPatch?: Partial<ChapterStudioData>;
}

export interface ApplyCompiledIntentResult {
  persisted: boolean;
  worldEntities: WorldEntitiesResult | null;
}

/** Persiste le contrat compilé + extrait/upsert les entités monde (USER-WINS). */
export async function applyCompiledIntentToChapter(
  input: ApplyCompiledIntentInput,
): Promise<ApplyCompiledIntentResult> {
  const { chapter, projectId, contract, narrativeContract, rawUserIntent, transitionReason } = input;

  // PONT conversationnel → wizard. Le launch + la readiness lisent `data.intent`
  // (shortPitch, etc.), PAS le chapterIntentContract. Sans ça, le studio
  // conversationnel laisse `intent` vide → readiness bloquée + autofill refusé
  // (pitch_too_short). On dérive donc `data.intent` depuis le contrat compilé.
  const pitch = (contract.understoodPitch?.trim() || rawUserIntent.trim()).slice(0, 600);
  const intentPatch = {
    chapterNumber: chapter.chapterNumber,
    workingTitle: chapter.title ?? null,
    shortPitch: pitch.length >= 3 ? pitch : null,
    emotionalGoal: contract.emotionalGoal?.trim() || null,
    mainConflict: contract.plotGoal?.trim() || null,
    endingMode: contract.expectedCliffhanger ? ("cliffhanger" as const) : null,
  };

  let persisted = false;
  try {
    const snapshot = patchChapterStudioSnapshot(
      chapter.outline,
      {
        ...(input.extraStudioPatch ?? {}),
        intent: intentPatch,
        chapterIntentContract: contract,
        // Persister AUSSI le narrativeContract pour que le pipeline
        // (run-full-chapter-pipeline, intent-coverage-qa, dialogue-scene-writer)
        // réutilise exactement le contrat compilé plutôt qu'un rebuild appauvri.
        intentNarrativeContract: narrativeContract,
      },
      {
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.title,
        chapterSummary: chapter.summary,
        cliffhanger: chapter.cliffhanger,
        userIntent: chapter.userIntent,
        transitionReason,
      },
    );

    const outlineRecord =
      chapter.outline && typeof chapter.outline === "object" && !Array.isArray(chapter.outline)
        ? (chapter.outline as Record<string, unknown>)
        : {};

    await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        outline: toPrismaInputJson({ ...outlineRecord, studio: snapshot }),
        studioUpdatedAt: new Date(),
        // Source de vérité de l'intention : le studio conversationnel ne passe
        // pas par l'étape userIntent du wizard. On persiste l'intention brute
        // (concat des messages) pour que /estimate et le pipeline la retrouvent.
        ...(rawUserIntent.trim().length >= 3 ? { userIntent: rawUserIntent.trim() } : {}),
      },
    });
    persisted = true;
  } catch (persistErr) {
    // Ne bloque pas l'utilisateur : il a le contrat dans la réponse.
    console.error(`[apply-compiled-intent] persist_failed (${transitionReason})`, persistErr);
  }

  let worldEntities: WorldEntitiesResult | null = null;
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { title: true, primaryGenre: true, tone: true },
    });
    const [existingNpc, existingProps] = await Promise.all([
      prisma.npcGroup.findMany({ where: { projectId }, select: { slug: true } }),
      prisma.worldProp.findMany({ where: { projectId }, select: { slug: true } }),
    ]);

    const extraction = await extractWorldEntitiesFromIntent({
      rawUserIntent: rawUserIntent || chapter.userIntent || "",
      projectTitle: project?.title ?? null,
      projectGenre: project?.primaryGenre ?? null,
      projectTone: project?.tone ?? null,
      existingNpcGroupSlugs: existingNpc.map((g) => g.slug),
      existingWorldPropSlugs: existingProps.map((p) => p.slug),
    });

    const upsertResult = await upsertWorldEntities({
      projectId,
      chapterId: chapter.id,
      source: extraction.source === "openai" ? "intent_compile_llm" : "intent_compile_heuristic",
      npcGroups: extraction.npcGroups,
      worldProps: extraction.worldProps,
    });

    worldEntities = {
      npcGroupsCreated: upsertResult.npcGroupsCreated,
      npcGroupsUpdated: upsertResult.npcGroupsUpdated,
      npcGroupsSkippedUserEdited: upsertResult.npcGroupsSkippedUserEdited,
      worldPropsCreated: upsertResult.worldPropsCreated,
      worldPropsUpdated: upsertResult.worldPropsUpdated,
      worldPropsSkippedUserEdited: upsertResult.worldPropsSkippedUserEdited,
      source: extraction.source,
      warnings: extraction.warnings,
    };
  } catch (extractErr) {
    console.error(`[apply-compiled-intent] world_extraction_failed (${transitionReason})`, extractErr);
  }

  return { persisted, worldEntities };
}
