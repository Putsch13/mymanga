/**
 * Validation de panels générés contre CharacterFingerprint et PanelContract.
 * Détecte les dérives visuelles et les incohérences.
 */

import {
  classifyPanelCriticality,
  getCharacterTierPolicy,
  resolveCharacterImportanceTier,
  type CharacterFingerprint,
  type PanelValidationResult,
} from "@manga-ai-studio/core";
import { runPropertyValidators, type SceneBlueprint } from "@manga-ai-studio/world";
import { analyzePanelWithVision } from "./services/panel-vision-analyzer";

export interface GeneratedPanelData {
  panelId: string;
  imageUrl: string;
  requiredCharacters: Array<{
    characterId: string;
    characterName: string;
    fingerprint: CharacterFingerprint;
  }>;
  metadata?: {
    prompt?: string;
    negativePrompt?: string;
    model?: string;
    sceneBlueprint?: SceneBlueprint;
    panelContract?: {
      shotType?: string;
      purpose?: string;
      mustShow?: string[];
      backgroundExtras?: string[];
    };
    stylePack?: {
      renderFamily?: string | null;
      lineWeight?: string | null;
      shadingMode?: string | null;
      contrastProfile?: string | null;
      anatomyBias?: string | null;
      backgroundDensity?: string | null;
      cameraLanguage?: string | null;
      negativeConstraints?: string[];
    };
    panelQa?: {
      heroCharacterId?: string | null;
      pageNumber?: number | null;
      panelNumber?: number | null;
      pagePanelCount?: number | null;
      panelCategory?: string | null;
      visualPriority?: string | null;
      characterRoles?: Array<string | null>;
      characterIds?: string[];
      explicitCriticality?: {
        level: "NON_CRITICAL" | "CRITICAL";
        reasons: string[];
      } | null;
    };
  };
}

function blendScores(heuristic: number, vision: number | null | undefined, confidence = 0.7) {
  if (typeof vision !== "number") return heuristic;
  const weight = clamp01(confidence);
  return clamp01(heuristic * (1 - weight) + vision * weight);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function includesAll(text: string, needles: string[]) {
  if (needles.length === 0) return 1;
  const matches = needles.filter((needle) => text.includes(needle.toLowerCase()));
  return matches.length / needles.length;
}

function computeQualityScores(panel: GeneratedPanelData, characterScore: number) {
  const prompt = panel.metadata?.prompt?.toLowerCase() ?? "";
  const blueprint = panel.metadata?.sceneBlueprint;
  const contract = panel.metadata?.panelContract;
  const stylePack = panel.metadata?.stylePack;
  const propertyChecks = blueprint ? runPropertyValidators(blueprint) : [];
  const backgroundNeedles = [
    ...(blueprint?.environment.mustShowLocationSignals ?? []),
    ...(blueprint?.environment.backgroundElements ?? []),
    ...(contract?.backgroundExtras ?? []),
  ]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((item) => item.toLowerCase())
    .slice(0, 8);
  const interactionNeedles = [
    blueprint?.composition.interactionBeat,
    ...(blueprint?.procedural.selectedLocations.primary.flatMap((item) => item.interactionHooks) ?? []),
    ...(blueprint?.procedural.selectedCreatures.primary.flatMap((item) => item.interactionHooks) ?? []),
  ]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((item) => item.toLowerCase())
    .slice(0, 6);
  const styleNeedles = [
    stylePack?.renderFamily,
    stylePack?.lineWeight,
    stylePack?.shadingMode,
    stylePack?.contrastProfile,
    stylePack?.anatomyBias,
    stylePack?.backgroundDensity,
    stylePack?.cameraLanguage,
  ]
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((item) => item.toLowerCase());
  const shotType = contract?.shotType ?? blueprint?.composition.shotType ?? "";
  const backgroundPresenceScore = clamp01(
    shotType === "wide"
      ? includesAll(prompt, backgroundNeedles.length > 0 ? backgroundNeedles.slice(0, 3) : ["environment"])
      : 0.7 + includesAll(prompt, backgroundNeedles.slice(0, 2)) * 0.3,
  );
  const environmentReadabilityScore = clamp01(
    0.4
      + includesAll(prompt, backgroundNeedles) * 0.4
      + ((blueprint?.environment.mustShowLocationSignals.length ?? 0) >= 2 ? 0.2 : 0),
  );
  const interactionScore = clamp01(0.35 + includesAll(prompt, interactionNeedles) * 0.65);
  const shotComplianceScore = clamp01(
    shotType === "wide"
      ? prompt.includes("full environment visible") || prompt.includes("wide shot")
        ? 1
        : 0.45
      : shotType === "medium"
        ? prompt.includes("character and environment both readable")
          ? 1
          : 0.55
        : shotType.includes("close")
          ? prompt.includes("environmental cues")
            ? 1
            : 0.6
          : shotType === "over_shoulder"
            ? prompt.includes("spatial relation")
              ? 1
              : 0.55
            : 0.7,
  );
  const styleConsistencyScore = clamp01(0.45 + includesAll(prompt, styleNeedles) * 0.55);
  const releaseScore = clamp01(
    characterScore * 0.25
      + backgroundPresenceScore * 0.2
      + environmentReadabilityScore * 0.15
      + interactionScore * 0.15
      + shotComplianceScore * 0.1
      + styleConsistencyScore * 0.15,
  );
  return {
    propertyChecks,
    qualityScores: {
      characterConsistencyScore: characterScore,
      backgroundPresenceScore,
      environmentReadabilityScore,
      interactionScore,
      shotComplianceScore,
      styleConsistencyScore,
      releaseScore,
    },
  };
}

/**
 * Valide un panel généré contre les fingerprints requis.
 * 
 * IMPORTANT: Cette v1 est basique (analyse de prompt).
 * Pour une vraie validation, il faudrait:
 * - Vision AI pour analyser l'image générée
 * - Détection de features visuelles
 * - Comparaison embeddings vs références canoniques
 * - Face recognition pour confirmer identité
 */
export async function validateGeneratedPanel(
  panel: GeneratedPanelData
): Promise<PanelValidationResult> {
  const issues: PanelValidationResult["issues"] = [];
  let score = 1.0;
  const characterTiers = (panel.metadata?.panelQa?.characterRoles ?? []).map((role) =>
    resolveCharacterImportanceTier({ roleType: role ?? null })
  );
  const computedCriticality =
    panel.metadata?.panelQa?.explicitCriticality
    ?? classifyPanelCriticality({
      shotType: panel.metadata?.panelContract?.shotType,
      purpose: panel.metadata?.panelContract?.purpose,
      panelCategory: panel.metadata?.panelQa?.panelCategory,
      pageNumber: panel.metadata?.panelQa?.pageNumber,
      panelNumber: panel.metadata?.panelQa?.panelNumber,
      pagePanelCount: panel.metadata?.panelQa?.pagePanelCount,
      characterIds: panel.metadata?.panelQa?.characterIds,
      characterTiers,
      heroCharacterId: panel.metadata?.panelQa?.heroCharacterId,
      visualPriority: panel.metadata?.panelQa?.visualPriority,
    });
  const qaWasRequired = computedCriticality.level === "CRITICAL"
    || characterTiers.some((tier) => getCharacterTierPolicy(tier).qaExpectation === "strict");

  // 1. Vérifier que tous les personnages requis sont mentionnés dans le prompt
  const prompt = panel.metadata?.prompt?.toLowerCase() ?? "";
  
  for (const char of panel.requiredCharacters) {
    const nameInPrompt = prompt.includes(char.characterName.toLowerCase());
    
    if (!nameInPrompt) {
      issues.push({
        severity: "critical",
        type: "missing_character",
        message: `Character ${char.characterName} not found in prompt`,
        autoFixable: false,
      });
      score -= 0.3;
    }

    // 2. Vérifier les traits clés du fingerprint dans le prompt
    const fp = char.fingerprint;
    
    // Vérifier cheveux
    const hairColor = fp.hair.color.toLowerCase();
    if (!prompt.includes(hairColor)) {
      issues.push({
        severity: "major",
        type: "wrong_hair",
        message: `${char.characterName}: hair color "${hairColor}" not in prompt`,
        autoFixable: true,
      });
      score -= 0.15;
    }

    // Vérifier yeux
    const eyeColor = fp.face.eyeColor.toLowerCase();
    if (!prompt.includes(eyeColor)) {
      issues.push({
        severity: "major",
        type: "wrong_eyes",
        message: `${char.characterName}: eye color "${eyeColor}" not in prompt`,
        autoFixable: true,
      });
      score -= 0.15;
    }

    // Vérifier genre
    if (fp.identity.gender === "male" && (prompt.includes("woman") || prompt.includes("female") || prompt.includes("girl"))) {
      issues.push({
        severity: "critical",
        type: "wrong_gender",
        message: `${char.characterName}: male character with female terms in prompt`,
        autoFixable: false,
      });
      score -= 0.4;
    }
    if (fp.identity.gender === "female" && (prompt.includes("man") || prompt.includes("male") || prompt.includes("boy"))) {
      issues.push({
        severity: "critical",
        type: "wrong_gender",
        message: `${char.characterName}: female character with male terms in prompt`,
        autoFixable: false,
      });
      score -= 0.4;
    }

    // Vérifier markers permanents
    for (const marker of fp.permanentMarkers) {
      if (marker && !prompt.includes(marker.toLowerCase())) {
        issues.push({
          severity: "minor",
          type: "missing_element",
          message: `${char.characterName}: permanent marker "${marker}" not in prompt`,
          autoFixable: true,
        });
        score -= 0.05;
      }
    }

    // Vérifier forbidden drifts
    for (const forbidden of fp.forbiddenDrift) {
      const forbiddenLower = forbidden.toLowerCase();
      if (forbiddenLower.includes("never") && prompt.includes(forbiddenLower.replace("never ", ""))) {
        issues.push({
          severity: "critical",
          type: "forbidden_element",
          message: `${char.characterName}: forbidden drift detected "${forbidden}"`,
          autoFixable: false,
        });
        score -= 0.3;
      }
    }
  }

  const { qualityScores: heuristicScores, propertyChecks } = computeQualityScores(panel, score);
  const visionAnalysis = await analyzePanelWithVision({
    imageUrl: panel.imageUrl,
    heuristicReleaseScore: heuristicScores.releaseScore,
    requiredCharacters: panel.requiredCharacters,
    panelContract: panel.metadata?.panelContract,
    stylePack: panel.metadata?.stylePack,
    sceneBlueprint: panel.metadata?.sceneBlueprint,
  });
  const qualityScores = {
    characterConsistencyScore: blendScores(
      heuristicScores.characterConsistencyScore,
      visionAnalysis?.characterConsistencyScore,
      visionAnalysis?.confidence ?? 0.65,
    ),
    backgroundPresenceScore: blendScores(
      heuristicScores.backgroundPresenceScore,
      visionAnalysis?.backgroundPresenceScore,
      visionAnalysis?.confidence ?? 0.75,
    ),
    environmentReadabilityScore: blendScores(
      heuristicScores.environmentReadabilityScore,
      visionAnalysis?.environmentReadabilityScore,
      visionAnalysis?.confidence ?? 0.75,
    ),
    interactionScore: blendScores(
      heuristicScores.interactionScore,
      visionAnalysis?.interactionScore,
      visionAnalysis?.confidence ?? 0.7,
    ),
    shotComplianceScore: blendScores(
      heuristicScores.shotComplianceScore,
      visionAnalysis?.shotComplianceScore,
      visionAnalysis?.confidence ?? 0.7,
    ),
    styleConsistencyScore: blendScores(
      heuristicScores.styleConsistencyScore,
      visionAnalysis?.styleConsistencyScore,
      visionAnalysis?.confidence ?? 0.65,
    ),
    releaseScore: blendScores(
      heuristicScores.releaseScore,
      visionAnalysis?.releaseScore,
      visionAnalysis?.confidence ?? 0.75,
    ),
    visionScore: visionAnalysis?.releaseScore ?? null,
  };
  const qaWasExecuted = Boolean(visionAnalysis);
  const qaFailureReason = qaWasRequired && !qaWasExecuted ? "visual_analyzer_unavailable_for_critical_panel" : null;
  const qaBypassReason = !qaWasRequired && !qaWasExecuted ? "non_critical_panel" : null;
  if (qaFailureReason) {
    issues.push({
      severity: "critical",
      type: "missing_visual_qa",
      message: "QA visuelle obligatoire indisponible sur un panel critique.",
      autoFixable: false,
    });
  }
  if (qualityScores.backgroundPresenceScore < 0.62) {
    issues.push({
      severity: (panel.metadata?.panelContract?.shotType ?? panel.metadata?.sceneBlueprint?.composition.shotType) === "wide" ? "critical" : "major",
      type: "empty_background",
      message: "Le décor lisible est insuffisant pour ce panel.",
      autoFixable: true,
    });
  }
  if (qualityScores.environmentReadabilityScore < 0.6) {
    issues.push({
      severity: "major",
      type: "weak_environment",
      message: "Les signaux d’environnement restent trop faibles.",
      autoFixable: true,
    });
  }
  if (qualityScores.interactionScore < 0.58) {
    issues.push({
      severity: "major",
      type: "weak_interaction",
      message: "L’interaction héros/PNJ/environnement manque de lisibilité.",
      autoFixable: true,
    });
  }
  if (qualityScores.styleConsistencyScore < 0.6) {
    issues.push({
      severity: "major",
      type: "style_drift",
      message: "Le style effectif ne reflète pas assez le style pack.",
      autoFixable: true,
    });
  }
  for (const check of propertyChecks.filter((item) => !item.ok)) {
    issues.push({
      severity: check.property === "background_presence" || check.property === "lore_guardrails" ? "critical" : "major",
      type:
        check.property === "background_presence"
          ? "empty_background"
          : check.property === "environment_interaction"
            ? "weak_interaction"
            : check.property === "style_pack_fidelity"
              ? "style_drift"
              : "weak_environment",
      message: check.message,
      autoFixable: check.property !== "lore_guardrails",
    });
  }
  for (const finding of visionAnalysis?.findings ?? []) {
    const normalized = finding.toLowerCase();
    if (/fond vide|decor vide|background empty|generic background/.test(normalized)) {
      issues.push({
        severity: "major",
        type: "empty_background",
        message: finding,
        autoFixable: true,
      });
    } else if (/interaction faible|no interaction|disconnected/.test(normalized)) {
      issues.push({
        severity: "major",
        type: "weak_interaction",
        message: finding,
        autoFixable: true,
      });
    } else if (/style|drift/.test(normalized)) {
      issues.push({
        severity: "major",
        type: "style_drift",
        message: finding,
        autoFixable: true,
      });
    }
  }

  // Borner le score entre 0 et 1
  score = clamp01(Math.min(score, qualityScores.releaseScore));

  // Déterminer si reroll requis
  const requiredReroll =
    Boolean(qaFailureReason)
    || !qaWasExecuted && qaWasRequired
    || issues.some((i) => i.type === "missing_visual_qa")
    ||
    score < 0.78
    || qualityScores.releaseScore < 0.72
    || qualityScores.backgroundPresenceScore < 0.55
    || qualityScores.interactionScore < 0.5
    || issues.some((i) => i.severity === "critical");

  return {
    panelId: panel.panelId,
    score,
    panelCriticality: {
      level: computedCriticality.level,
      reasons: computedCriticality.reasons,
    },
    qualityScores,
    visionAnalysis: {
      enabled: qaWasExecuted,
      model: visionAnalysis?.model ?? null,
      confidence: visionAnalysis?.confidence ?? null,
      findings: visionAnalysis?.findings ?? [],
    },
    propertyChecks,
    issues,
    qaWasRequired,
    qaWasExecuted,
    qaFailureReason,
    qaBypassReason,
    requiredReroll,
  };
}

/**
 * Score la cohérence d'un personnage spécifique dans un panel.
 */
export async function scoreCharacterConsistency(input: {
  characterName: string;
  fingerprint: CharacterFingerprint;
  panelPrompt: string;
  panelImageUrl?: string;
}): Promise<{
  score: number;
  details: {
    face: number;
    hair: number;
    eyes: number;
    gender: number;
    markers: number;
  };
}> {
  // Version simplifiée basée sur prompt
  const prompt = input.panelPrompt.toLowerCase();
  const fp = input.fingerprint;

  const scores = {
    face: 1.0,
    hair: prompt.includes(fp.hair.color.toLowerCase()) ? 1.0 : 0.5,
    eyes: prompt.includes(fp.face.eyeColor.toLowerCase()) ? 1.0 : 0.5,
    gender: 1.0,
    markers: 1.0,
  };

  // Vérifier gender
  if (fp.identity.gender === "male" && (prompt.includes("woman") || prompt.includes("female"))) {
    scores.gender = 0.0;
  }
  if (fp.identity.gender === "female" && (prompt.includes("man") || prompt.includes("male"))) {
    scores.gender = 0.0;
  }

  // Vérifier markers
  if (fp.permanentMarkers.length > 0) {
    const foundMarkers = fp.permanentMarkers.filter((m) =>
      m && prompt.includes(m.toLowerCase())
    );
    scores.markers = foundMarkers.length / fp.permanentMarkers.length;
  }

  const overallScore =
    (scores.face * 0.2 +
      scores.hair * 0.25 +
      scores.eyes * 0.25 +
      scores.gender * 0.2 +
      scores.markers * 0.1);

  return {
    score: overallScore,
    details: scores,
  };
}
