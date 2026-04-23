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
    panelBlueprints: Array.from({ length: 72 }, (_, i) => ({
      panelId: `panel-${i + 1}`,
      beatId: `beat-${Math.min(i + 1, beatCount)}`,
      panelIndex: i,
      panelNumber: i + 1,
      purpose: "Introduire le héros",
      cameraAngle: "eye_level",
      subjectFocus: "hero",
      shotType: "medium",
      requiredProps: [],
      presenceObligations: [],
    })),
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
