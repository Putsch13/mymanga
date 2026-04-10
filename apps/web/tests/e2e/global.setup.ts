import {
  buildChapterReadinessReport,
  buildProductionPlanFromOutline,
  buildStructuredChapterRuntimeFields,
  createEmptyChapterStudioSnapshot,
  updateChapterStudioSnapshot,
  type ChapterStudioData,
  type ProductionOutline,
} from "@manga-ai-studio/core";
import { prisma, type Prisma } from "@manga-ai-studio/db";

const FIXTURE_IDS = {
  userEmail: "dev@manga-ai.studio",
  projectId: "e2e-project-studio",
  projectSlug: "e2e-project-studio",
  blockedChapterId: "e2e-chapter-blocked",
  readyChapterId: "e2e-chapter-ready",
  reviewChapterId: "e2e-chapter-review",
} as const;

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function imageData(label: string, background: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="100%" height="100%" fill="${background}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="42">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function buildReadyOutline(): ProductionOutline {
  return {
    source: "generated",
    chapterGoal: "Le heros prend l'avantage dans l'arc.",
    cliffhanger: "Un nouvel ennemi surgit.",
    beats: Array.from({ length: 10 }, (_, index) => ({
      beatId: `beat_${index + 1}`,
      summary: `Beat ${index + 1}`,
      narrativeFunction: index === 9 ? "cliffhanger" : "progression",
      whyThisBeatExists: `Beat ${index + 1} fait avancer le chapitre.`,
      dramaticChange: index === 9 ? "reveal" : "escalation",
      involvedCharacters: ["hero-e2e", "ally-e2e"],
      activeCanonConstraints: [],
      environmentContext: ["Cour du lycee"],
      visualPriority: index >= 8 ? "high" : "medium",
      estimatedPanels: 6,
      criticality: index >= 8 ? "critical" : "medium",
      continuityDependencies: [],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 80,
      redundancyRisk: 15,
    })),
  };
}

function buildSnapshot(data: Partial<ChapterStudioData>, currentStep: "intent" | "readiness" = "intent") {
  return updateChapterStudioSnapshot(
    createEmptyChapterStudioSnapshot(),
    data,
    {
      currentStep,
      transitionReason: "playwright_fixture",
    },
  );
}

async function seedChapter(input: {
  chapterId: string;
  projectId: string;
  chapterNumber: number;
  title: string;
  userIntent: string;
  summary?: string;
  studioData: Partial<ChapterStudioData>;
  currentStep?: "intent" | "readiness";
  status?: string;
}) {
  const snapshot = buildSnapshot(input.studioData, input.currentStep ?? "intent");
  snapshot.data.readinessReport = buildChapterReadinessReport(snapshot);
  const structured = buildStructuredChapterRuntimeFields({
    snapshot,
    counts: {
      minimumImages: snapshot.data.readinessReport.imageCounts.minimumImages,
      generatedImages: 0,
      acceptedImages: 0,
      rejectedImages: 0,
    },
    criticalPanelsCount: 0,
    criticalPanelsBlocked: 0,
    criticalPanelsMissingQa: 0,
  });

  await prisma.chapter.upsert({
    where: { id: input.chapterId },
    update: {
      projectId: input.projectId,
      chapterNumber: input.chapterNumber,
      title: input.title,
      userIntent: input.userIntent,
      summary: input.summary ?? input.userIntent,
      status: input.status ?? "draft",
      outline: asJson({ studio: snapshot }),
      studioStatus: structured.studioStatus,
      studioCurrentStep: structured.studioCurrentStep,
      studioUpdatedAt: structured.studioUpdatedAt ? new Date(structured.studioUpdatedAt) : null,
      studioAutosaveVersion: structured.studioAutosaveVersion,
      minimumImages: structured.minimumImages,
      generatedImages: structured.generatedImages,
      acceptedImages: structured.acceptedImages,
      rejectedImages: structured.rejectedImages,
      missingImages: structured.missingImages,
      criticalPanelsCount: structured.criticalPanelsCount,
      criticalPanelsBlocked: structured.criticalPanelsBlocked,
      criticalPanelsMissingQa: structured.criticalPanelsMissingQa,
      reviewBlockedReason: structured.reviewBlockedReason,
    },
    create: {
      id: input.chapterId,
      projectId: input.projectId,
      chapterNumber: input.chapterNumber,
      title: input.title,
      userIntent: input.userIntent,
      summary: input.summary ?? input.userIntent,
      status: input.status ?? "draft",
      outline: asJson({ studio: snapshot }),
      studioStatus: structured.studioStatus,
      studioCurrentStep: structured.studioCurrentStep,
      studioUpdatedAt: structured.studioUpdatedAt ? new Date(structured.studioUpdatedAt) : null,
      studioAutosaveVersion: structured.studioAutosaveVersion,
      minimumImages: structured.minimumImages,
      generatedImages: structured.generatedImages,
      acceptedImages: structured.acceptedImages,
      rejectedImages: structured.rejectedImages,
      missingImages: structured.missingImages,
      criticalPanelsCount: structured.criticalPanelsCount,
      criticalPanelsBlocked: structured.criticalPanelsBlocked,
      criticalPanelsMissingQa: structured.criticalPanelsMissingQa,
      reviewBlockedReason: structured.reviewBlockedReason,
    },
  });
}

export default async function globalSetup() {
  const user = await prisma.user.upsert({
    where: { email: FIXTURE_IDS.userEmail },
    update: {
      displayName: "Studio Dev",
      role: "admin",
    },
    create: {
      email: FIXTURE_IDS.userEmail,
      displayName: "Studio Dev",
      role: "admin",
    },
  });

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: { balance: 500 },
    create: { userId: user.id, balance: 500, lifetimePurchased: 500, lifetimeSpent: 0, lifetimeRefunded: 0 },
  });

  await prisma.project.upsert({
    where: { id: FIXTURE_IDS.projectId },
    update: {
      userId: user.id,
      title: "Playwright Studio Project",
      slug: FIXTURE_IDS.projectSlug,
      pitch: "Projet e2e pour Chapter Studio.",
      status: "draft",
    },
    create: {
      id: FIXTURE_IDS.projectId,
      userId: user.id,
      title: "Playwright Studio Project",
      slug: FIXTURE_IDS.projectSlug,
      pitch: "Projet e2e pour Chapter Studio.",
      status: "draft",
    },
  });

  const readyOutline = buildReadyOutline();
  const readyPlan = buildProductionPlanFromOutline(readyOutline, { minimumImages: 55, lockedCharacters: ["hero-e2e"] });

  await seedChapter({
    chapterId: FIXTURE_IDS.blockedChapterId,
    projectId: FIXTURE_IDS.projectId,
    chapterNumber: 1,
    title: "Chapitre bloque e2e",
    userIntent: "Chapitre bloque pour verifier le gate.",
    studioData: {
      intent: {
        chapterNumber: 1,
        workingTitle: "Chapitre bloque e2e",
        shortPitch: "Le heros hesite avant le duel.",
        mainConflict: "Le heros n'ose pas entrer en scene.",
      },
    },
    currentStep: "intent",
  });

  await seedChapter({
    chapterId: FIXTURE_IDS.readyChapterId,
    projectId: FIXTURE_IDS.projectId,
    chapterNumber: 2,
    title: "Chapitre pret e2e",
    userIntent: "Chapitre pret pour le launch.",
    studioData: {
      intent: {
        chapterNumber: 2,
        workingTitle: "Chapitre pret e2e",
        shortPitch: "Le heros remonte la pente et reprend l'initiative.",
        mainConflict: "Battre l'adversaire avant l'effondrement.",
      },
      narrativeContract: {
        emotionalGoal: "Retrouver confiance",
        heroStateAtStart: "hesitant",
        heroStateAtEnd: "determine",
        centralConflict: "Rival dominant",
        revealOrInformationGain: "Le rival est manipule",
        relationshipShift: "L'allie fait confiance au heros",
        chapterQuestion: "Peut-il reprendre l'avantage ?",
        endingMode: "cliffhanger",
        tone: "dramatic",
        intensityCurve: [35, 70, 95],
        forbiddenNarrativeMisses: [],
      },
      characterSelection: {
        heroCharacterId: "hero-e2e",
        activeCharacterIds: ["hero-e2e", "ally-e2e"],
        lockedCharacterIds: ["hero-e2e"],
        speakingCharacterIds: ["hero-e2e", "ally-e2e"],
        evolvingCharacterIds: ["hero-e2e"],
        antagonistCharacterIds: ["villain-e2e"],
        recurringNpcIds: [],
      },
      chapterCanon: {
        heroOutfitId: null,
        activeCharacters: ["hero-e2e", "ally-e2e"],
        allowedVisualChanges: [],
        currentLocation: "Cour du lycee",
        weather: "orage",
        timeOfDay: "soir",
        injuries: [],
        carriedObjects: [],
        continuityNotes: ["Le heros garde sa veste dechiree."],
        inheritedFromPreviousChapter: true,
        universeConstraints: [],
      },
      editorialOutline: {
        summary: "Le heros reprend confiance avant un reveal final.",
        validationNotes: [],
        beats: Array.from({ length: 5 }, (_, index) => ({
          beatId: `editorial_${index + 1}`,
          label: `Bloc ${index + 1}`,
          summary: `Bloc ${index + 1}`,
          narrativePurpose: "progression",
          dramaticShift: "escalation",
          involvedCharacters: ["hero-e2e", "ally-e2e"],
        })),
      },
      productionOutline: readyOutline,
      productionPlan: readyPlan,
    },
    currentStep: "readiness",
    status: "ready_for_render",
  });

  await seedChapter({
    chapterId: FIXTURE_IDS.reviewChapterId,
    projectId: FIXTURE_IDS.projectId,
    chapterNumber: 3,
    title: "Chapitre review e2e",
    userIntent: "Chapitre de review e2e.",
    studioData: {
      intent: {
        chapterNumber: 3,
        workingTitle: "Chapitre review e2e",
        shortPitch: "Une review doit montrer les panels manquants.",
        mainConflict: "Valider la qualite du chapitre.",
      },
      narrativeContract: {
        emotionalGoal: "Tenir la pression",
        heroStateAtStart: "fatigue",
        heroStateAtEnd: "lucide",
        centralConflict: "Validation QA",
        revealOrInformationGain: "Le chapitre est incomplet",
        relationshipShift: "L'equipe retarde la publication",
        chapterQuestion: "Que faut-il corriger ?",
        endingMode: "resolution",
        tone: "dramatic",
        intensityCurve: [65, 35],
        forbiddenNarrativeMisses: [],
      },
      characterSelection: {
        heroCharacterId: "hero-e2e",
        activeCharacterIds: ["hero-e2e"],
        lockedCharacterIds: ["hero-e2e"],
        speakingCharacterIds: ["hero-e2e"],
        evolvingCharacterIds: ["hero-e2e"],
        antagonistCharacterIds: [],
        recurringNpcIds: ["npc-recurring-e2e"],
      },
      chapterCanon: {
        heroOutfitId: null,
        activeCharacters: ["hero-e2e"],
        allowedVisualChanges: [],
        currentLocation: "Salle de review",
        weather: "neutre",
        timeOfDay: "nuit",
        injuries: [],
        carriedObjects: [],
        continuityNotes: ["Le heros analyse les panels."],
        inheritedFromPreviousChapter: true,
        universeConstraints: [],
      },
      editorialOutline: {
        summary: "Review QA e2e.",
        validationNotes: [],
        beats: Array.from({ length: 5 }, (_, index) => ({
          beatId: `review_editorial_${index + 1}`,
          label: `Bloc ${index + 1}`,
          summary: `Bloc ${index + 1}`,
          narrativePurpose: "analysis",
          dramaticShift: "evaluation",
          involvedCharacters: ["hero-e2e"],
        })),
      },
      productionOutline: readyOutline,
      productionPlan: readyPlan,
    },
    currentStep: "readiness",
    status: "review_required",
  });

  await prisma.sceneImage.deleteMany({
    where: {
      scene: {
        chapterId: FIXTURE_IDS.reviewChapterId,
      },
    },
  });
  await prisma.chapterScene.deleteMany({ where: { chapterId: FIXTURE_IDS.reviewChapterId } });

  const scene = await prisma.chapterScene.create({
    data: {
      chapterId: FIXTURE_IDS.reviewChapterId,
      sceneNumber: 1,
      title: "Review scene",
      summary: "Scene e2e",
    },
  });

  await prisma.sceneImage.createMany({
    data: [
      {
        id: "e2e-panel-current",
        sceneId: scene.id,
        panelNumber: 1,
        status: "completed",
        imageUrl: imageData("current", "#4f46e5"),
        prompt: "hero close-up",
        consistencyScore: 0.84,
        metadata: asJson({
          previousImageUrl: imageData("previous", "#0f172a"),
          promptDebug: { finalPrompt: "hero close-up, stable recurring npc marker" },
          validationDetails: {
            panelCriticality: { level: "CRITICAL", reasons: ["hero_closeup"] },
            qaWasRequired: true,
            qaWasExecuted: true,
            qualityScores: {
              releaseScore: 0.84,
              styleConsistencyScore: 0.84,
              interactionScore: 0.82,
              shotComplianceScore: 0.86,
              environmentReadabilityScore: 0.8,
            },
            issues: [],
          },
        }),
      },
      {
        id: "e2e-panel-blocked",
        sceneId: scene.id,
        panelNumber: 2,
        status: "blocked",
        imageUrl: imageData("blocked", "#991b1b"),
        prompt: "critical reveal panel",
        consistencyScore: 0.41,
        metadata: asJson({
          promptDebug: { finalPrompt: "critical reveal panel" },
          validationDetails: {
            panelCriticality: { level: "CRITICAL", reasons: ["major_reveal"] },
            qaWasRequired: true,
            qaWasExecuted: false,
            qaFailureReason: "visual_analyzer_unavailable_for_critical_panel",
            qualityScores: {
              releaseScore: 0.41,
              styleConsistencyScore: 0.4,
              interactionScore: 0.38,
              shotComplianceScore: 0.45,
              environmentReadabilityScore: 0.42,
            },
            issues: [{ type: "missing_visual_qa", message: "QA critique manquante" }],
          },
        }),
      },
    ],
  });

  await prisma.chapter.update({
    where: { id: FIXTURE_IDS.reviewChapterId },
    data: {
      generatedImages: 2,
      acceptedImages: 1,
      rejectedImages: 1,
      minimumImages: 55,
      missingImages: 54,
      criticalPanelsCount: 2,
      criticalPanelsBlocked: 1,
      criticalPanelsMissingQa: 1,
      reviewBlockedReason: "missing_images",
    },
  });
}
