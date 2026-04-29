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
import { runPropertyValidators } from "@manga-ai-studio/world";
import type { SceneBlueprint } from "@manga-ai-studio/world";
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
      // Premium contractual fields
      subjectFocus?: string;
      mustShowEnemy?: boolean;
      requiredNpcCount?: number;
      speakerAnchorCharacterId?: string | null;
      dialogueCarrier?: string;
      cutawayType?: string;
      heroCenterAllowed?: boolean;
      requiredPropsTyped?: Array<{ canonicalName: string; mustBeVisible: boolean; visibilityMode: string; narrativeRole: string; category?: string }>;
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
  // Hoisted : contract utilisé dès le calcul de weak_interaction (plus bas)
  // et à nouveau dans le bloc Premium contractual QA checks.
  const contract = panel.metadata?.panelContract;
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

    // Vérifier genre — utiliser \b pour éviter les faux positifs ("manga" contient "man", "woman" contient "man")
    const hasFemaleTerms = /\b(woman|female|girl)\b/i.test(prompt);
    const hasMaleTerms = /\b(man|male|boy)\b/i.test(prompt);
    if (fp.identity.gender === "male" && hasFemaleTerms) {
      issues.push({
        severity: "critical",
        type: "wrong_gender",
        message: `${char.characterName}: male character with female terms in prompt`,
        autoFixable: false,
      });
      score -= 0.4;
    }
    if (fp.identity.gender === "female" && hasMaleTerms) {
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
  const qualityScores: {
    characterConsistencyScore: number;
    backgroundPresenceScore: number;
    environmentReadabilityScore: number;
    interactionScore: number;
    shotComplianceScore: number;
    styleConsistencyScore: number;
    releaseScore: number;
    visionScore: number | null;
    propComplianceScore?: number;
    subjectFocusScore?: number;
    dialogueAnchorScore?: number;
    enemyPresenceScore?: number;
    populationScore?: number;
    cutawayComplianceScore?: number;
  } = {
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
  // weak_interaction ne s'applique qu'aux panels qui ont vocation à montrer une interaction
  // (2+ persos, ou subjectFocus=group). Un panel solo (closeup hero) ou environnement n'en a pas besoin.
  const qsContractFocus = (contract as Record<string, unknown> | undefined)?.subjectFocus as string | null ?? null;
  const interactionApplicable =
    (panel.requiredCharacters?.length ?? 0) >= 2
    || qsContractFocus === "group"
    || qsContractFocus === "enemy"
    || qsContractFocus === "antagonist";
  if (interactionApplicable && qualityScores.interactionScore < 0.58) {
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

  // ─── Premium contractual QA checks ──────────────────────────────────────────
  // (contract déjà hoisted en début de fonction)
  let propComplianceScore = 1.0;
  let subjectFocusScore = 1.0;
  let dialogueAnchorScore = 1.0;
  let enemyPresenceScore = 1.0;
  let populationScore = 1.0;
  let cutawayComplianceScore = 1.0;

  // Check required props
  if (contract?.requiredPropsTyped && contract.requiredPropsTyped.length > 0) {
    const visibleProps = contract.requiredPropsTyped.filter((p) =>
      p.mustBeVisible && prompt.includes(p.canonicalName.toLowerCase()),
    );
    const missingProps = contract.requiredPropsTyped.filter(
      (p) => p.mustBeVisible && !prompt.includes(p.canonicalName.toLowerCase()),
    );
    const mustBeVisibleCount = contract.requiredPropsTyped.filter((p) => p.mustBeVisible).length;
    propComplianceScore = mustBeVisibleCount > 0
      ? visibleProps.length / mustBeVisibleCount
      : 1.0;

    for (const missingProp of missingProps) {
      const issueType =
        missingProp.narrativeRole === "threat" ? "missing_weapon" as const
        : missingProp.category === "device" ? "missing_device" as const
        : "missing_prop" as const;
      issues.push({
        severity: missingProp.narrativeRole === "action_tool" || missingProp.narrativeRole === "threat" ? "critical" : "major",
        type: issueType,
        message: `Prop obligatoire absent du prompt: "${missingProp.canonicalName}". Ce prop doit être clairement visible.`,
        autoFixable: true,
      });
      score -= 0.15;
    }

    // Check "object used but not visible"
    const usedButNotVisible = contract.requiredPropsTyped.filter(
      (p) => (p.visibilityMode === "used_in_action" || p.visibilityMode === "in_hand") && !prompt.includes(p.canonicalName.toLowerCase()),
    );
    for (const prop of usedButNotVisible) {
      issues.push({
        severity: "major",
        type: "object_used_but_not_visible",
        message: `Objet utilisé dans l'action mais absent visuellement: "${prop.canonicalName}"`,
        autoFixable: true,
      });
    }
  }

  // Check subject focus
  if (contract?.subjectFocus) {
    const focusKeywords: Record<string, string[]> = {
      enemy: ["enemy", "adversary", "villain", "opponent", "ennemi", "adversaire"],
      environment: ["environment", "location", "landscape", "décor", "lieu", "paysage"],
      prop: ["object", "prop", "item", "objet", "accessoire"],
      npc: ["crowd", "npc", "people", "foule", "passants"],
      aftermath: ["aftermath", "damage", "destruction", "aftermath", "conséquence"],
    };
    const expectedKeywords = focusKeywords[contract.subjectFocus];
    if (expectedKeywords && !expectedKeywords.some((kw) => prompt.includes(kw))) {
      if (contract.subjectFocus !== "hero" && contract.subjectFocus !== "reaction" && contract.subjectFocus !== "group" && contract.subjectFocus !== "ally") {
        subjectFocusScore = 0.4;
        issues.push({
          severity: "major",
          type: "wrong_subject_focus",
          message: `Le focus sujet attendu "${contract.subjectFocus}" n'est pas reflété dans le prompt.`,
          autoFixable: true,
        });
        score -= 0.1;
      }
    }
  }

  // Check cutaway compliance (score dédié + issues spécialisées)
  if (contract?.cutawayType && contract.cutawayType !== "none") {
    const isHeroCentric = !contract.heroCenterAllowed &&
      (prompt.includes("hero portrait") || prompt.includes("character portrait") || prompt.includes("close-up face"));
    if (isHeroCentric) {
      cutawayComplianceScore = 0.2;
      issues.push({
        severity: "major",
        type: "cutaway_collapsed_to_hero",
        message: `Ce panel est un cutaway "${contract.cutawayType}" mais le prompt est un portrait héros. Le sujet du cutaway doit être au premier plan.`,
        autoFixable: true,
      });
      score -= 0.1;
    }
    // Vérifier que le sujet attendu du cutaway est présent dans le prompt
    const cutawayTargetKeywords: Record<string, string[]> = {
      environment_establishing: ["environment", "location", "landscape", "décor", "exterior", "building", "street"],
      enemy_reveal: ["enemy", "villain", "adversary", "silhouette", "shadow", "figure"],
      object_insert: ["object", "prop", "item", "objet", "accessoire", "weapon", "artifact"],
      reaction_insert: ["reaction", "expression", "face", "eyes", "shock", "surprise"],
      location_transition: ["location", "transition", "exterior", "interior", "establishing"],
      threat_insert: ["threat", "danger", "weapon", "blade", "gun", "menace"],
    };
    const expectedKws = cutawayTargetKeywords[contract.cutawayType] ?? [];
    if (expectedKws.length > 0 && !expectedKws.some((kw) => prompt.includes(kw))) {
      cutawayComplianceScore = Math.min(cutawayComplianceScore, 0.4);
      issues.push({
        severity: "major",
        type: "wrong_cutaway_target",
        message: `Cutaway "${contract.cutawayType}" attendu mais le sujet cible n'est pas détecté dans le prompt.`,
        autoFixable: true,
      });
      score -= 0.05;
    }
  }

  // Check enemy presence — mais uniquement si le panel cible effectivement l'ennemi.
  // Un panel focalisé NPC / environnement / prop / reaction / aftermath n'a pas vocation
  // à montrer l'ennemi, donc mustShowEnemy serait un faux positif critique.
  const contractSubjectFocus = (contract as Record<string, unknown> | undefined)?.subjectFocus as string | null ?? null;
  const enemyFocusApplicable =
    !contractSubjectFocus
    || contractSubjectFocus === "hero"
    || contractSubjectFocus === "enemy"
    || contractSubjectFocus === "antagonist"
    || contractSubjectFocus === "group";
  if (contract?.mustShowEnemy && enemyFocusApplicable) {
    const enemyKeywords = ["enemy", "adversary", "villain", "opponent", "ennemi", "adversaire", "attacker", "attaquant"];
    const enemyVisible = enemyKeywords.some((kw) => prompt.includes(kw));
    if (!enemyVisible) {
      enemyPresenceScore = 0.2;
      issues.push({
        severity: "critical",
        type: "missing_enemy_presence",
        message: "L'ennemi/adversaire doit être visible dans ce panel mais est absent du prompt.",
        autoFixable: true,
      });
      score -= 0.2;
    }
  }

  // Check dialogue anchor — speakerAnchorCharacterId est un ID, on doit le résoudre en nom
  // via panel.requiredCharacters pour chercher la mention dans le prompt.
  if (contract?.speakerAnchorCharacterId && contract?.dialogueCarrier === "speaker_visible") {
    const speakerChar = panel.requiredCharacters.find((c) => c.characterId === contract.speakerAnchorCharacterId);
    const speakerName = speakerChar?.characterName.toLowerCase() ?? null;
    const speakerVisible = speakerName
      ? prompt.includes(speakerName) || prompt.includes("speaker") || prompt.includes("dialogue")
      // Pas de nom résolu : on ne peut pas juger, on ne pénalise pas (ex: retry avec metadata partielle)
      : true;
    if (!speakerVisible) {
      dialogueAnchorScore = 0.3;
      issues.push({
        severity: "major",
        type: "missing_dialogue_anchor",
        message: `Le speaker du dialogue (${speakerChar?.characterName ?? contract.speakerAnchorCharacterId}) doit être visible mais n'est pas ancré dans le prompt.`,
        autoFixable: true,
      });
      score -= 0.1;
    }
  }

  // Check NPC population
  if (contract?.requiredNpcCount && contract.requiredNpcCount > 0) {
    const crowdKeywords = ["crowd", "people", "group", "foule", "passants", "students", "spectators", "bystanders"];
    const hasCrowd = crowdKeywords.some((kw) => prompt.includes(kw));
    if (!hasCrowd) {
      populationScore = 0.3;
      issues.push({
        severity: "minor",
        type: "npc_population_missing",
        message: `Ce panel requiert ${contract.requiredNpcCount} PNJ minimum mais aucune présence de foule n'est détectée.`,
        autoFixable: true,
      });
    }
  }

  // Merge premium scores into qualityScores
  qualityScores.propComplianceScore = clamp01(propComplianceScore);
  qualityScores.subjectFocusScore = clamp01(subjectFocusScore);
  qualityScores.dialogueAnchorScore = clamp01(dialogueAnchorScore);
  qualityScores.enemyPresenceScore = clamp01(enemyPresenceScore);
  qualityScores.populationScore = clamp01(populationScore);
  qualityScores.cutawayComplianceScore = clamp01(cutawayComplianceScore);

  // Borner le score entre 0 et 1
  score = clamp01(Math.min(score, qualityScores.releaseScore));

  // Déterminer si reroll requis
  // Note: l'indisponibilité de la vision QA (qaFailureReason) est un avertissement, pas un bloquant —
  // bloquer systématiquement quand Vision est désactivé empêcherait tout rendu manga.
  const requiredReroll =
    score < 0.78
    || qualityScores.releaseScore < 0.72
    || qualityScores.backgroundPresenceScore < 0.55
    || qualityScores.interactionScore < 0.5
    || issues.some((i) => i.severity === "critical" && i.type !== "missing_visual_qa")
    // Premium contractual failures
    || issues.some((i) => i.type === "missing_enemy_presence")
    || issues.some((i) => i.type === "missing_prop" || i.type === "missing_weapon" || i.type === "missing_device");

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
