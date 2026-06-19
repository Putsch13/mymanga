/**
 * Endpoint de l'interviewer IA (refonte UX conversationnelle).
 *
 * Boucle : l'auteur écrit en langage libre → on (re)compile l'intention →
 * on persiste le contrat dans le snapshot studio (vu par readiness + launch) →
 * on calcule la prochaine fournée de questions ciblées (planificateur pur).
 *
 * Réutilise `compileChapterIntentUsecase` + la persistance snapshot existante :
 * l'interview n'est qu'une couche d'orchestration au-dessus de briques éprouvées.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import {
  planInterviewQuestions,
  planInterviewQuestionsLlm,
  type InterviewQuestionKind,
} from "@manga-ai-studio/ai";
import type { ChapterIntentContract } from "@manga-ai-studio/core";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedChapter } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";
import { compileChapterIntentUsecase, UsecaseFailure } from "@/server/usecases";
import { applyCompiledIntentToChapter } from "@/lib/chapter-studio/apply-compiled-intent";
import { readChapterStudioSnapshotFromOutline } from "@/lib/chapter-studio";

type Ctx = { params: Promise<{ id: string; chapterId: string }> };

const INTERVIEW_QUESTION_KINDS = [
  "main_event",
  "stakes",
  "era",
  "location",
  "npcs",
  "creatures",
  "props",
  "emotional_goal",
  "cliffhanger",
  "tone",
] as const satisfies readonly InterviewQuestionKind[];

const bodySchema = z.object({
  /** Tour de conversation : on ne garde que le texte des messages "user". */
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .default([]),
  /** Questions déjà traitées (y compris répondues « aucun »). */
  answeredKinds: z.array(z.enum(INTERVIEW_QUESTION_KINDS)).optional().default([]),
  /** Borne le nombre de questions retournées (UX : 1–3 à la fois). */
  maxQuestions: z.number().int().min(1).max(3).optional().default(3),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const rl = await checkRateLimit(user.id, "chapter-intent-compile");
  if (!rl.ok) {
    return NextResponse.json(
      { error: rl.message },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const { id: projectId, chapterId } = await ctx.params;
  const chapter = await getOwnedChapter(user.id, projectId, chapterId);
  if (!chapter) return notFound();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const rawUserIntent = body.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n\n");

  const [projectCharacters, npcGroups] = await Promise.all([
    prisma.character.findMany({
      where: { projectId },
      select: { id: true, name: true, roleType: true },
    }),
    prisma.npcGroup.findMany({ where: { projectId }, select: { label: true } }),
  ]);
  const knownCharacterNames = projectCharacters.map((c) => c.name).filter(Boolean);
  const resolvedNpcNames = npcGroups.map((g) => g.label).filter((l): l is string => Boolean(l));

  // Pas encore d'intention exploitable : on amorce l'interview sans compiler.
  // On tente quand même le LLM pour une ouverture CONVERSATIONNELLE dès le 1er
  // tour (repli déterministe si pas de clé / échec).
  if (rawUserIntent.length < 8) {
    const emptyc = emptyContract();
    const llmPlan = await planInterviewQuestionsLlm({
      messages: body.messages,
      contract: emptyc,
      knownCharacterNames,
      resolvedNpcNames,
      maxQuestions: body.maxQuestions,
    });
    const plan =
      llmPlan
      ?? planInterviewQuestions(
        {
          contract: emptyc,
          knownCharacterNames,
          resolvedNpcNames,
          answeredKinds: body.answeredKinds,
        },
        body.maxQuestions,
      );
    return NextResponse.json({
      contract: null,
      plan,
      canvas: buildCanvas(null, knownCharacterNames, resolvedNpcNames),
      persisted: false,
      interviewer: llmPlan ? "llm" : "deterministic",
    });
  }

  let contract;
  let narrativeContract = null;
  let usedAi = false;
  try {
    const result = await compileChapterIntentUsecase.execute({
      rawUserIntent,
      chapterId: chapter.id,
      knownCharacters: projectCharacters,
    });
    contract = result.contract;
    narrativeContract = result.narrativeContract;
    usedAi = result.usedAi;
  } catch (err) {
    if (err instanceof UsecaseFailure && err.code === "INTENT_RAW_TOO_SHORT") {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }

  // FIABILITÉ — auto-dériver la sélection de cast si l'auteur n'en a pas
  // (le flux conversationnel ne passe pas par l'étape Personnages du wizard).
  // Sans héros, le launch génère un chapitre sans protagoniste ancré.
  // On ne touche RIEN si une sélection existe déjà (USER-WINS).
  const currentSnapshot = readChapterStudioSnapshotFromOutline({
    outline: chapter.outline,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    chapterSummary: chapter.summary,
    cliffhanger: chapter.cliffhanger,
    userIntent: chapter.userIntent,
  });
  const hasHero = Boolean(currentSnapshot.data.characterSelection?.heroCharacterId);
  const extraStudioPatch =
    !hasHero && projectCharacters.length > 0
      ? { characterSelection: buildDefaultCastSelection(projectCharacters) }
      : undefined;

  // Persistance + extraction monde PARTAGÉE avec /intent-compile (parité de
  // fiabilité : narrativeContract persisté + PNJ/props upsertés USER-WINS).
  const { persisted, worldEntities } = await applyCompiledIntentToChapter({
    chapter,
    projectId,
    contract,
    narrativeContract,
    rawUserIntent,
    transitionReason: "interview_turn",
    extraStudioPatch,
  });

  // Recharger les PNJ persistés (l'extraction a pu en créer ce tour-ci) pour
  // que le canevas les reflète immédiatement.
  const refreshedNpcNames = worldEntities
    ? (await prisma.npcGroup.findMany({ where: { projectId }, select: { label: true } }))
        .map((g) => g.label)
        .filter((l): l is string => Boolean(l))
    : resolvedNpcNames;

  // Interviewer CONVERSATIONNEL : on tente d'abord le LLM (vrai dialogue qui
  // s'adapte aux réponses), avec repli sur la checklist déterministe si le LLM
  // échoue ou n'est pas configuré (jamais de blocage).
  const llmPlan = await planInterviewQuestionsLlm({
    messages: body.messages,
    contract,
    knownCharacterNames,
    resolvedNpcNames: refreshedNpcNames,
    maxQuestions: body.maxQuestions,
  });
  const plan =
    llmPlan
    ?? planInterviewQuestions(
      {
        contract,
        knownCharacterNames,
        resolvedNpcNames: refreshedNpcNames,
        answeredKinds: body.answeredKinds,
      },
      body.maxQuestions,
    );

  return NextResponse.json({
    contract,
    plan,
    canvas: buildCanvas(contract, knownCharacterNames, refreshedNpcNames),
    usedAi,
    persisted,
    worldEntities,
    interviewer: llmPlan ? "llm" : "deterministic",
  });
}

/**
 * Sélection de cast par défaut pour un chapitre configuré en conversationnel :
 * héros = 1er perso au rôle héros/protagoniste (sinon 1er perso), cast actif =
 * tous les persos du projet. Garantit un protagoniste ancré au launch.
 */
function buildDefaultCastSelection(
  characters: Array<{ id: string; name: string; roleType: string | null }>,
) {
  const isHeroRole = (r: string | null) => {
    const v = (r ?? "").toLowerCase();
    return v.includes("hero") || v.includes("héros") || v.includes("protag") || v.includes("main") || v.includes("lead");
  };
  const hero = characters.find((c) => isHeroRole(c.roleType)) ?? characters[0]!;
  const allIds = characters.map((c) => c.id);
  return {
    heroCharacterId: hero.id,
    secondaryHeroCharacterId: null,
    deuteragonistCharacterId: null,
    coreCastCharacterIds: [hero.id],
    activeCharacterIds: allIds,
    lockedCharacterIds: [],
    speakingCharacterIds: allIds,
    evolvingCharacterIds: [],
    antagonistCharacterIds: characters.filter((c) => (c.roleType ?? "").toLowerCase().includes("antagon")).map((c) => c.id),
    recurringNpcIds: [],
  };
}

/** Contrat vide minimal pour amorcer le planificateur avant toute saisie. */
function emptyContract(): ChapterIntentContract {
  return {
    rawUserIntent: "",
    understoodPitch: "",
    era: "",
    setting: "",
    mustInclude: [],
    mustAvoid: [],
    requiredCharacters: [],
    requiredLocations: [],
    requiredNpcs: [],
    requiredCreatures: [],
    requiredProps: [],
    emotionalGoal: "",
    plotGoal: "",
    characterArcGoal: "",
    tone: "",
    pacing: "balanced" as const,
    dialogueDensity: "medium" as const,
    expectedCliffhanger: false,
    ambiguityFlags: [],
    confidenceScore: 0,
  };
}

/** Snapshot lisible du canevas de config (alimente l'UI live). */
function buildCanvas(
  contract: ChapterIntentContract | null,
  knownCharacterNames: string[],
  resolvedNpcNames: string[],
) {
  return {
    characters: knownCharacterNames,
    era: contract?.era ?? "",
    setting: contract?.setting ?? "",
    locations: contract?.requiredLocations ?? [],
    npcs: [...new Set([...(contract?.requiredNpcs ?? []), ...resolvedNpcNames])],
    creatures: contract?.requiredCreatures ?? [],
    props: contract?.requiredProps ?? [],
    plotGoal: contract?.plotGoal ?? "",
    emotionalGoal: contract?.emotionalGoal ?? "",
    tone: contract?.tone ?? "",
    confidenceScore: contract?.confidenceScore ?? 0,
  };
}
