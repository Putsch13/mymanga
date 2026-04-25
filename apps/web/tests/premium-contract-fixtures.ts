export const premiumTestUser = {
  id: "user-1",
  email: "user@test.com",
  preferences: null,
};

export const premiumTestProject = {
  id: "project-1",
  userId: "user-1",
  contentRating: "TEEN",
  intensityLayer: "TEEN",
  user: premiumTestUser,
  title: "Mon Projet",
};

function buildApprovedOutline(beatCount: number) {
  return {
    summary: "Résumé",
    cliffhanger: "Fin",
    beats: Array.from({ length: beatCount }, (_, i) => ({
      id: `beat-${i + 1}`,
      summary: `Beat ${i + 1}`,
      pageRole: "action",
      turn: "montée",
      characters: ["hero-1"],
    })),
    approvedAt: new Date().toISOString(),
    approvalVersion: "v1",
    source: "user_approved",
  };
}

function buildProductionOutline(beatCount: number) {
  return {
    source: "premium_rebuilt",
    chapterGoal: "But du chapitre",
    cliffhanger: "Fin",
    beats: Array.from({ length: beatCount }, (_, i) => ({
      beatId: `beat-${i + 1}`,
      summary: `Beat ${i + 1}`,
      narrativeFunction: "progression",
      whyThisBeatExists: "avancer",
      dramaticChange: "changement",
      involvedCharacters: ["hero-1"],
      activeCanonConstraints: [],
      environmentContext: [],
      visualPriority: "high",
      estimatedPanels: 6,
      criticality: "high",
      continuityDependencies: [],
      infoGained: null,
      emotionProduced: null,
      indispensabilityScore: 80,
      redundancyRisk: 10,
    })),
  };
}

function buildProductionPlan(beatCount: number) {
  return {
    pageCount: 11,
    pages: Array.from({ length: 11 }, (_, i) => ({
      pageNumber: i + 1,
      beatIds: [`beat-${Math.min(i + 1, beatCount)}`],
      panelCount: 5,
      imageTarget: 5,
      criticalPanelCount: 1,
    })),
    panelsPerPage: Array.from({ length: 11 }, () => 5),
    estimatedImages: 75,
    targetImages: 75,
    minimumImages: 75,
    criticalPanels: ["p1"],
    lockedCharacters: ["hero-1"],
    compressionRisks: [],
    enrichmentAdjustments: [],
    imageBudgetStatus: "on_target",
    panelBlueprints: Array.from({ length: 75 }, (_, i) => {
      const isCutaway = i % 5 === 0;
      return {
        panelId: `panel-${i + 1}`,
        beatId: `beat-${(i % beatCount) + 1}`,
        panelIndex: i,
        panelNumber: i + 1,
        purpose: "Introduire le héros",
        cameraAngle: "eye_level",
        subjectFocus: isCutaway ? ("environment" as const) : ("hero" as const),
        shotType: ["medium", "wide", "close_up", "establishing", "reaction", "over_shoulder"][i % 6],
        mustShowEnemy: false,
        requiredNpcCount: 0,
        requiredProps: [],
        requiredLocationSignals: [],
        presenceObligations: [],
        cutawayType: isCutaway ? ("environment" as const) : ("none" as const),
        heroCenterAllowed: true,
        criticality: "medium" as const,
        mustShowCharacterIds: isCutaway ? [] : ["hero-1"],
        requiredCharacterIds: isCutaway ? [] : ["hero-1"],
        dialogueCarrier: isCutaway ? undefined : ("speaker_visible" as const),
        dialogueLines: isCutaway
          ? undefined
          : ([{ speaker: "hero-1", text: "Ligne test." }] as const),
      };
    }),
    premiumReadinessScore: 0.85,
    heroCenterRatio: 0.5,
    focusDistribution: { hero: 5 },
    propCoverage: { covered: ["katana"], missing: [] },
    enemyCoverage: { panelCount: 2, beatsCovered: ["beat-1"] },
    npcCoverage: { panelCount: 1, avgNpcCount: 2 },
    cutawayCoverage: { count: 1, ratio: 0.1 },
    dialogueAnchorCoverage: { anchored: 2, floating: 0 },
  };
}

export function buildPremiumStudioData(beatCount = 10) {
  return {
    characterSelection: {
      heroCharacterId: "hero-1",
      activeCharacterIds: ["hero-1", "support-1"],
      lockedCharacterIds: ["hero-1"],
    },
    activeNpcIds: ["npc-1", "npc-2"],
    activeCreatureIds: ["creature-1"],
    locationIds: ["dojo", "rooftop"],
    productionOutline: buildProductionOutline(beatCount),
    productionPlan: buildProductionPlan(beatCount),
    readinessReport: {
      status: "ready",
      imageCounts: {
        estimatedImages: 75,
        targetImages: 75,
        minimumImages: 75,
        generatedImages: 0,
        acceptedImages: 0,
        rejectedImages: 0,
        missingImages: 75,
      },
    },
  };
}

export function buildPremiumPipelineChapterOutline(beatCount = 10) {
  return {
    id: "chapter-1",
    chapterNumber: 1,
    title: "Chapitre 1",
    summary: "Résumé",
    cliffhanger: "Fin",
    userIntent: "Test",
    status: "draft",
    studioStatus: "READY_FOR_GENERATION",
    studioCurrentStep: "production_plan",
    studioUpdatedAt: new Date(),
    studioAutosaveVersion: 1,
    minimumImages: 75,
    generatedImages: 0,
    acceptedImages: 0,
    rejectedImages: 0,
    missingImages: 75,
    criticalPanelsCount: 0,
    criticalPanelsBlocked: 0,
    criticalPanelsMissingQa: 0,
    reviewBlockedReason: null,
    outline: {
      approvedOutline: buildApprovedOutline(beatCount),
      studio: {
        status: "READY_FOR_GENERATION",
        currentStep: "production_plan",
        autosaveVersion: 1,
        history: [],
        updatedAt: new Date().toISOString(),
        data: buildPremiumStudioData(beatCount),
      },
    },
  };
}

export function buildPremiumLaunchChapter(beatCount = 10) {
  return {
    ...buildPremiumPipelineChapterOutline(beatCount),
    project: {
      id: "project-1",
      userId: "user-1",
      contentRating: "TEEN",
      intensityLayer: "TEEN",
      user: premiumTestUser,
    },
  };
}
