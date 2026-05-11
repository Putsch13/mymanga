/**
 * Vérifications "premium contractual" : props requis, subject focus, cutaway,
 * présence ennemie, ancrage du dialogue, peuplement PNJ.
 *
 * Chaque check renvoie un score borné 0..1 et accumule les issues spécifiques
 * dans le tableau partagé. Une pénalité agrégée est aussi renvoyée pour le
 * score brut (avant blending Vision).
 */
import type { GeneratedPanelData, PanelIssue } from "./types";
import { clamp01 } from "./utils";

export interface ContractCheckScores {
  propComplianceScore: number;
  subjectFocusScore: number;
  dialogueAnchorScore: number;
  enemyPresenceScore: number;
  populationScore: number;
  cutawayComplianceScore: number;
}

export interface ContractCheckResult {
  scores: ContractCheckScores;
  scorePenalty: number;
}

export function applyContractChecks(
  panel: GeneratedPanelData,
  prompt: string,
  issues: PanelIssue[],
): ContractCheckResult {
  const contract = panel.metadata?.panelContract;
  const scores: ContractCheckScores = {
    propComplianceScore: 1.0,
    subjectFocusScore: 1.0,
    dialogueAnchorScore: 1.0,
    enemyPresenceScore: 1.0,
    populationScore: 1.0,
    cutawayComplianceScore: 1.0,
  };
  let penalty = 0;

  if (contract?.requiredPropsTyped && contract.requiredPropsTyped.length > 0) {
    const visibleProps = contract.requiredPropsTyped.filter(
      (p) => p.mustBeVisible && prompt.includes(p.canonicalName.toLowerCase()),
    );
    const missingProps = contract.requiredPropsTyped.filter(
      (p) => p.mustBeVisible && !prompt.includes(p.canonicalName.toLowerCase()),
    );
    const mustBeVisibleCount = contract.requiredPropsTyped.filter(
      (p) => p.mustBeVisible,
    ).length;
    scores.propComplianceScore =
      mustBeVisibleCount > 0 ? visibleProps.length / mustBeVisibleCount : 1.0;

    for (const missingProp of missingProps) {
      const issueType =
        missingProp.narrativeRole === "threat"
          ? ("missing_weapon" as const)
          : missingProp.category === "device"
            ? ("missing_device" as const)
            : ("missing_prop" as const);
      issues.push({
        severity:
          missingProp.narrativeRole === "action_tool" ||
          missingProp.narrativeRole === "threat"
            ? "critical"
            : "major",
        type: issueType,
        message: `Prop obligatoire absent du prompt: "${missingProp.canonicalName}". Ce prop doit être clairement visible.`,
        autoFixable: true,
      });
      penalty += 0.15;
    }

    const usedButNotVisible = contract.requiredPropsTyped.filter(
      (p) =>
        (p.visibilityMode === "used_in_action" || p.visibilityMode === "in_hand") &&
        !prompt.includes(p.canonicalName.toLowerCase()),
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

  if (contract?.subjectFocus) {
    const focusKeywords: Record<string, string[]> = {
      enemy: ["enemy", "adversary", "villain", "opponent", "ennemi", "adversaire"],
      environment: [
        "environment",
        "location",
        "landscape",
        "décor",
        "lieu",
        "paysage",
      ],
      prop: ["object", "prop", "item", "objet", "accessoire"],
      npc: ["crowd", "npc", "people", "foule", "passants"],
      aftermath: ["aftermath", "damage", "destruction", "conséquence"],
    };
    const expectedKeywords = focusKeywords[contract.subjectFocus];
    if (expectedKeywords && !expectedKeywords.some((kw) => prompt.includes(kw))) {
      const isStrictFocus =
        contract.subjectFocus !== "hero" &&
        contract.subjectFocus !== "reaction" &&
        contract.subjectFocus !== "group" &&
        contract.subjectFocus !== "ally";
      if (isStrictFocus) {
        scores.subjectFocusScore = 0.4;
        issues.push({
          severity: "major",
          type: "wrong_subject_focus",
          message: `Le focus sujet attendu "${contract.subjectFocus}" n'est pas reflété dans le prompt.`,
          autoFixable: true,
        });
        penalty += 0.1;
      }
    }
  }

  if (contract?.cutawayType && contract.cutawayType !== "none") {
    const isHeroCentric =
      !contract.heroCenterAllowed &&
      (prompt.includes("hero portrait") ||
        prompt.includes("character portrait") ||
        prompt.includes("close-up face"));
    if (isHeroCentric) {
      scores.cutawayComplianceScore = 0.2;
      issues.push({
        severity: "major",
        type: "cutaway_collapsed_to_hero",
        message: `Ce panel est un cutaway "${contract.cutawayType}" mais le prompt est un portrait héros. Le sujet du cutaway doit être au premier plan.`,
        autoFixable: true,
      });
      penalty += 0.1;
    }

    const cutawayTargetKeywords: Record<string, string[]> = {
      environment_establishing: [
        "environment",
        "location",
        "landscape",
        "décor",
        "exterior",
        "building",
        "street",
      ],
      enemy_reveal: [
        "enemy",
        "villain",
        "adversary",
        "silhouette",
        "shadow",
        "figure",
      ],
      object_insert: [
        "object",
        "prop",
        "item",
        "objet",
        "accessoire",
        "weapon",
        "artifact",
      ],
      reaction_insert: [
        "reaction",
        "expression",
        "face",
        "eyes",
        "shock",
        "surprise",
      ],
      location_transition: [
        "location",
        "transition",
        "exterior",
        "interior",
        "establishing",
      ],
      threat_insert: ["threat", "danger", "weapon", "blade", "gun", "menace"],
    };
    const expectedKws = cutawayTargetKeywords[contract.cutawayType] ?? [];
    if (expectedKws.length > 0 && !expectedKws.some((kw) => prompt.includes(kw))) {
      scores.cutawayComplianceScore = Math.min(scores.cutawayComplianceScore, 0.4);
      issues.push({
        severity: "major",
        type: "wrong_cutaway_target",
        message: `Cutaway "${contract.cutawayType}" attendu mais le sujet cible n'est pas détecté dans le prompt.`,
        autoFixable: true,
      });
      penalty += 0.05;
    }
  }

  // Présence ennemie : seulement si le panel cible effectivement l'ennemi.
  const focus =
    (contract as Record<string, unknown> | undefined)?.subjectFocus as string | null ??
    null;
  const enemyFocusApplicable =
    !focus ||
    focus === "hero" ||
    focus === "enemy" ||
    focus === "antagonist" ||
    focus === "group";
  if (contract?.mustShowEnemy && enemyFocusApplicable) {
    const enemyKeywords = [
      "enemy",
      "adversary",
      "villain",
      "opponent",
      "ennemi",
      "adversaire",
      "attacker",
      "attaquant",
    ];
    const enemyVisible = enemyKeywords.some((kw) => prompt.includes(kw));
    if (!enemyVisible) {
      scores.enemyPresenceScore = 0.2;
      issues.push({
        severity: "critical",
        type: "missing_enemy_presence",
        message:
          "L'ennemi/adversaire doit être visible dans ce panel mais est absent du prompt.",
        autoFixable: true,
      });
      penalty += 0.2;
    }
  }

  // Ancrage de dialogue : speakerAnchorCharacterId est un ID ; on cherche le
  // nom dans le prompt en le résolvant via `requiredCharacters`.
  if (
    contract?.speakerAnchorCharacterId &&
    contract?.dialogueCarrier === "speaker_visible"
  ) {
    const speakerChar = panel.requiredCharacters.find(
      (c) => c.characterId === contract.speakerAnchorCharacterId,
    );
    const speakerName = speakerChar?.characterName.toLowerCase() ?? null;
    const speakerVisible = speakerName
      ? prompt.includes(speakerName) ||
        prompt.includes("speaker") ||
        prompt.includes("dialogue")
      : true;
    if (!speakerVisible) {
      scores.dialogueAnchorScore = 0.3;
      issues.push({
        severity: "major",
        type: "missing_dialogue_anchor",
        message: `Le speaker du dialogue (${
          speakerChar?.characterName ?? contract.speakerAnchorCharacterId
        }) doit être visible mais n'est pas ancré dans le prompt.`,
        autoFixable: true,
      });
      penalty += 0.1;
    }
  }

  if (contract?.requiredNpcCount && contract.requiredNpcCount > 0) {
    const crowdKeywords = [
      "crowd",
      "people",
      "group",
      "foule",
      "passants",
      "students",
      "spectators",
      "bystanders",
    ];
    const hasCrowd = crowdKeywords.some((kw) => prompt.includes(kw));
    if (!hasCrowd) {
      scores.populationScore = 0.3;
      issues.push({
        severity: "minor",
        type: "npc_population_missing",
        message: `Ce panel requiert ${contract.requiredNpcCount} PNJ minimum mais aucune présence de foule n'est détectée.`,
        autoFixable: true,
      });
    }
  }

  // Clamp tous les scores à [0,1] pour respecter le contrat de sortie.
  scores.propComplianceScore = clamp01(scores.propComplianceScore);
  scores.subjectFocusScore = clamp01(scores.subjectFocusScore);
  scores.dialogueAnchorScore = clamp01(scores.dialogueAnchorScore);
  scores.enemyPresenceScore = clamp01(scores.enemyPresenceScore);
  scores.populationScore = clamp01(scores.populationScore);
  scores.cutawayComplianceScore = clamp01(scores.cutawayComplianceScore);

  return { scores, scorePenalty: penalty };
}
