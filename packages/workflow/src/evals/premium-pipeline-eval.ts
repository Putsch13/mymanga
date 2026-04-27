/**
 * premium-pipeline-eval.ts
 *
 * P1.18 — Évaluation du pipeline premium avec scénarios génériques.
 *
 * Métriques minimales:
 *   - narrativeContractCoverage >= 0.90
 *   - panelSpecificity >= 0.90
 *   - characterCanonCoverage = 1.00
 *   - dialoguePersistence = 1.00
 *   - noBlankTextAreas = 1.00
 *   - stableImageUrls = 1.00
 *   - noPremiumFallbacks = 1.00
 *   - promptContractCoverage = 1.00
 *   - noLegacyRouteBypass = 1.00
 */

export interface EvalScenario {
  name: string;
  description: string;
  requirements: {
    mainCharacterCount: number;
    hasDistinctVisualTraits: boolean;
    hasSecondaryGroups: boolean;
    hasNarrativeObject: boolean;
    hasPhysicalAction: boolean;
    hasSilentEmotionalScene: boolean;
    hasMultiCharacterDialogue: boolean;
    hasLocationChange: boolean;
    hasClimaxCliffhanger: boolean;
  };
}

export interface EvalMetrics {
  narrativeContractCoverage: number;
  panelSpecificity: number;
  characterCanonCoverage: number;
  dialoguePersistence: number;
  noBlankTextAreas: number;
  stableImageUrls: number;
  noPremiumFallbacks: number;
  promptContractCoverage: number;
  noLegacyRouteBypass: number;
}

export interface EvalResult {
  scenario: EvalScenario;
  metrics: EvalMetrics;
  passed: boolean;
  failures: string[];
}

export const MINIMUM_THRESHOLDS: EvalMetrics = {
  narrativeContractCoverage: 0.9,
  panelSpecificity: 0.9,
  characterCanonCoverage: 1.0,
  dialoguePersistence: 1.0,
  noBlankTextAreas: 1.0,
  stableImageUrls: 1.0,
  noPremiumFallbacks: 1.0,
  promptContractCoverage: 1.0,
  noLegacyRouteBypass: 1.0,
};

export const EVAL_SCENARIOS: EvalScenario[] = [
  {
    name: "two_protagonists_visual_distinct",
    description: "Chapitre avec deux personnages principaux et traits visuels distincts",
    requirements: {
      mainCharacterCount: 2,
      hasDistinctVisualTraits: true,
      hasSecondaryGroups: false,
      hasNarrativeObject: false,
      hasPhysicalAction: false,
      hasSilentEmotionalScene: false,
      hasMultiCharacterDialogue: true,
      hasLocationChange: false,
      hasClimaxCliffhanger: false,
    },
  },
  {
    name: "secondary_groups_required",
    description: "Chapitre avec groupes secondaires obligatoires",
    requirements: {
      mainCharacterCount: 1,
      hasDistinctVisualTraits: false,
      hasSecondaryGroups: true,
      hasNarrativeObject: false,
      hasPhysicalAction: false,
      hasSilentEmotionalScene: false,
      hasMultiCharacterDialogue: false,
      hasLocationChange: false,
      hasClimaxCliffhanger: false,
    },
  },
  {
    name: "narrative_object",
    description: "Chapitre avec objet narratif important",
    requirements: {
      mainCharacterCount: 1,
      hasDistinctVisualTraits: false,
      hasSecondaryGroups: false,
      hasNarrativeObject: true,
      hasPhysicalAction: false,
      hasSilentEmotionalScene: false,
      hasMultiCharacterDialogue: false,
      hasLocationChange: false,
      hasClimaxCliffhanger: false,
    },
  },
  {
    name: "physical_action",
    description: "Chapitre avec action physique claire",
    requirements: {
      mainCharacterCount: 1,
      hasDistinctVisualTraits: false,
      hasSecondaryGroups: false,
      hasNarrativeObject: false,
      hasPhysicalAction: true,
      hasSilentEmotionalScene: false,
      hasMultiCharacterDialogue: false,
      hasLocationChange: false,
      hasClimaxCliffhanger: false,
    },
  },
  {
    name: "silent_emotional",
    description: "Chapitre avec scène silencieuse émotionnelle",
    requirements: {
      mainCharacterCount: 1,
      hasDistinctVisualTraits: false,
      hasSecondaryGroups: false,
      hasNarrativeObject: false,
      hasPhysicalAction: false,
      hasSilentEmotionalScene: true,
      hasMultiCharacterDialogue: false,
      hasLocationChange: false,
      hasClimaxCliffhanger: false,
    },
  },
  {
    name: "multi_character_dialogue",
    description: "Chapitre avec dialogues multi-personnages",
    requirements: {
      mainCharacterCount: 3,
      hasDistinctVisualTraits: false,
      hasSecondaryGroups: false,
      hasNarrativeObject: false,
      hasPhysicalAction: false,
      hasSilentEmotionalScene: false,
      hasMultiCharacterDialogue: true,
      hasLocationChange: false,
      hasClimaxCliffhanger: false,
    },
  },
  {
    name: "location_change",
    description: "Chapitre avec changement de lieu",
    requirements: {
      mainCharacterCount: 1,
      hasDistinctVisualTraits: false,
      hasSecondaryGroups: false,
      hasNarrativeObject: false,
      hasPhysicalAction: false,
      hasSilentEmotionalScene: false,
      hasMultiCharacterDialogue: false,
      hasLocationChange: true,
      hasClimaxCliffhanger: false,
    },
  },
  {
    name: "climax_cliffhanger",
    description: "Chapitre avec climax et cliffhanger",
    requirements: {
      mainCharacterCount: 1,
      hasDistinctVisualTraits: false,
      hasSecondaryGroups: false,
      hasNarrativeObject: false,
      hasPhysicalAction: true,
      hasSilentEmotionalScene: false,
      hasMultiCharacterDialogue: false,
      hasLocationChange: false,
      hasClimaxCliffhanger: true,
    },
  },
];

export function evaluateMetrics(metrics: EvalMetrics): {
  passed: boolean;
  failures: string[];
} {
  const failures: string[] = [];

  for (const [key, threshold] of Object.entries(MINIMUM_THRESHOLDS)) {
    const value = metrics[key as keyof EvalMetrics];
    if (value < threshold) {
      failures.push(
        `${key}: ${(value * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}% required`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

export function computeMetricsFromPanels(panels: Array<{
  hasSourceBeatId: boolean;
  hasSpecificAction: boolean;
  hasCharacterCanon: boolean;
  hasDialoguePersisted: boolean;
  hasNoBlankText: boolean;
  hasStableUrl: boolean;
  usedFallback: boolean;
  hasPromptContract: boolean;
  usedLegacyRoute: boolean;
}>): EvalMetrics {
  if (panels.length === 0) {
    return {
      narrativeContractCoverage: 0,
      panelSpecificity: 0,
      characterCanonCoverage: 0,
      dialoguePersistence: 0,
      noBlankTextAreas: 0,
      stableImageUrls: 0,
      noPremiumFallbacks: 0,
      promptContractCoverage: 0,
      noLegacyRouteBypass: 0,
    };
  }

  const count = (fn: (p: (typeof panels)[0]) => boolean) =>
    panels.filter(fn).length / panels.length;

  return {
    narrativeContractCoverage: count((p) => p.hasSourceBeatId),
    panelSpecificity: count((p) => p.hasSpecificAction),
    characterCanonCoverage: count((p) => p.hasCharacterCanon),
    dialoguePersistence: count((p) => p.hasDialoguePersisted),
    noBlankTextAreas: count((p) => p.hasNoBlankText),
    stableImageUrls: count((p) => p.hasStableUrl),
    noPremiumFallbacks: count((p) => !p.usedFallback),
    promptContractCoverage: count((p) => p.hasPromptContract),
    noLegacyRouteBypass: count((p) => !p.usedLegacyRoute),
  };
}

export function runScenarioEval(
  scenario: EvalScenario,
  metrics: EvalMetrics
): EvalResult {
  const { passed, failures } = evaluateMetrics(metrics);

  return {
    scenario,
    metrics,
    passed,
    failures,
  };
}
