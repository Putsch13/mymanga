/**
 * Émission d'issues qualité à partir des scores heuristiques et de l'analyse
 * Vision : décor vide, environnement faible, interactions, style drift…
 */
import type { GeneratedPanelData, PanelIssue, QualityScores } from "./types";

export interface PushQualityIssuesArgs {
  panel: GeneratedPanelData;
  qualityScores: QualityScores;
  visionFindings: string[];
  propertyChecks: Array<{ ok: boolean; property: string; message: string }>;
  issues: PanelIssue[];
}

export function pushQualityIssues({
  panel,
  qualityScores,
  visionFindings,
  propertyChecks,
  issues,
}: PushQualityIssuesArgs): void {
  if (qualityScores.backgroundPresenceScore < 0.62) {
    const shotType =
      panel.metadata?.panelContract?.shotType ??
      panel.metadata?.sceneBlueprint?.composition.shotType;
    issues.push({
      severity: shotType === "wide" ? "critical" : "major",
      type: "empty_background",
      message: "Le décor lisible est insuffisant pour ce panel.",
      autoFixable: true,
    });
  }
  if (qualityScores.environmentReadabilityScore < 0.6) {
    issues.push({
      severity: "major",
      type: "weak_environment",
      message: "Les signaux d'environnement restent trop faibles.",
      autoFixable: true,
    });
  }

  // weak_interaction n'a de sens qu'avec 2+ persos (ou un focus group/enemy/antagonist).
  const contract = panel.metadata?.panelContract;
  const focus =
    (contract as Record<string, unknown> | undefined)?.subjectFocus as string | null ??
    null;
  const interactionApplicable =
    (panel.requiredCharacters?.length ?? 0) >= 2 ||
    focus === "group" ||
    focus === "enemy" ||
    focus === "antagonist";
  if (interactionApplicable && qualityScores.interactionScore < 0.58) {
    issues.push({
      severity: "major",
      type: "weak_interaction",
      message: "L'interaction héros/PNJ/environnement manque de lisibilité.",
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
      severity:
        check.property === "background_presence" ||
        check.property === "lore_guardrails"
          ? "critical"
          : "major",
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

  for (const finding of visionFindings) {
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
}
