/**
 * Validation de panels générés contre `CharacterFingerprint` et `PanelContract`.
 *
 * Ce fichier est volontairement court : il orchestre les sous-modules de
 * `_panel-validator/` pour produire un `PanelValidationResult` consolidé.
 *
 * Étapes :
 *   1. Résoudre la criticality (qa requise ou non)
 *   2. Vérifier la fidélité de chaque personnage (`character-checks`)
 *   3. Calculer les scores qualité heuristiques (`quality-scores`)
 *   4. Blender avec l'analyse Vision QA quand disponible
 *   5. Émettre les issues qualité (`quality-issues`)
 *   6. Vérifier le contrat premium (`contract-checks`)
 *   7. Calculer le `requiredReroll` final
 */

import type { PanelValidationResult } from "@manga-ai-studio/core";
import { applyCharacterChecks } from "./_panel-validator/character-checks";
import { applyContractChecks } from "./_panel-validator/contract-checks";
import { resolvePanelCriticality } from "./_panel-validator/criticality";
import { computeQualityScores } from "./_panel-validator/quality-scores";
import { pushQualityIssues } from "./_panel-validator/quality-issues";
import type {
  GeneratedPanelData,
  PanelIssue,
  QualityScores,
} from "./_panel-validator/types";
import { blendScores, clamp01 } from "./_panel-validator/utils";
import { analyzePanelWithVision } from "./services/panel-vision-analyzer";

export type { GeneratedPanelData } from "./_panel-validator/types";
export { scoreCharacterConsistency } from "./_panel-validator/score-character-consistency";

export async function validateGeneratedPanel(
  panel: GeneratedPanelData,
): Promise<PanelValidationResult> {
  const issues: PanelIssue[] = [];
  const prompt = panel.metadata?.prompt?.toLowerCase() ?? "";

  const { computed: computedCriticality, qaWasRequired } =
    resolvePanelCriticality(panel);

  let score = 1.0 - applyCharacterChecks(panel, prompt, issues);

  const { qualityScores: heuristicScores, propertyChecks } = computeQualityScores(
    panel,
    score,
  );
  const visionAnalysis = await analyzePanelWithVision({
    imageUrl: panel.imageUrl,
    heuristicReleaseScore: heuristicScores.releaseScore,
    requiredCharacters: panel.requiredCharacters,
    panelContract: panel.metadata?.panelContract,
    stylePack: panel.metadata?.stylePack,
    sceneBlueprint: panel.metadata?.sceneBlueprint,
  });

  const qualityScores: QualityScores = {
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
  const qaFailureReason =
    qaWasRequired && !qaWasExecuted ? "visual_analyzer_unavailable_for_critical_panel" : null;
  const qaBypassReason = !qaWasRequired && !qaWasExecuted ? "non_critical_panel" : null;
  if (qaFailureReason) {
    issues.push({
      severity: "critical",
      type: "missing_visual_qa",
      message: "QA visuelle obligatoire indisponible sur un panel critique.",
      autoFixable: false,
    });
  }

  pushQualityIssues({
    panel,
    qualityScores,
    visionFindings: visionAnalysis?.findings ?? [],
    propertyChecks,
    issues,
  });

  const contractResult = applyContractChecks(panel, prompt, issues);
  score -= contractResult.scorePenalty;
  qualityScores.propComplianceScore = contractResult.scores.propComplianceScore;
  qualityScores.subjectFocusScore = contractResult.scores.subjectFocusScore;
  qualityScores.dialogueAnchorScore = contractResult.scores.dialogueAnchorScore;
  qualityScores.enemyPresenceScore = contractResult.scores.enemyPresenceScore;
  qualityScores.populationScore = contractResult.scores.populationScore;
  qualityScores.cutawayComplianceScore = contractResult.scores.cutawayComplianceScore;

  // Score final borné par 0..1 et plafonné par le release score.
  score = clamp01(Math.min(score, qualityScores.releaseScore));

  // Note : l'indisponibilité de la Vision QA (`qaFailureReason`) reste un
  // avertissement et non un bloqueur — bloquer systématiquement quand Vision
  // est désactivé empêcherait tout rendu manga.
  const requiredReroll =
    score < 0.78 ||
    qualityScores.releaseScore < 0.72 ||
    qualityScores.backgroundPresenceScore < 0.55 ||
    qualityScores.interactionScore < 0.5 ||
    issues.some((i) => i.severity === "critical" && i.type !== "missing_visual_qa") ||
    issues.some((i) => i.type === "missing_enemy_presence") ||
    issues.some(
      (i) =>
        i.type === "missing_prop" ||
        i.type === "missing_weapon" ||
        i.type === "missing_device",
    );

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
