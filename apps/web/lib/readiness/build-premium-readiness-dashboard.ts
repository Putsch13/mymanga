/**
 * P1.3 — Agrégat « dashboard » readiness premium : score, issues lisibles, actions.
 * Complète `buildChapterReadinessReport` (studio) avec contrats wizard + QA dialogue.
 */

import {
  buildChapterReadinessReport,
  buildPanelTextContractFromBlueprintTextFields,
  isPersistedPanelTextContract,
  isPipelineV3PremiumOnlyEnabled,
  resolvePanelTextContractFromBlueprintPremium,
  runDialogueQaPremium,
  visualWorldContractSchema,
  type ChapterStudioSnapshot,
} from "@manga-ai-studio/core";
import {
  CHAPTER_WIZARD_STEP_ORDER,
  type ChapterWizardStepId,
  wizardStepFromReadinessIssue,
} from "@/features/studio/wizard/chapter-wizard-model";
import { generationErrorFromCode, type GenerationError } from "@/shared/errors/generation-errors";

export type PremiumReadinessDashboardIssueSeverity = "warning" | "blocked";

export type PremiumReadinessDashboardIssue = {
  code: string;
  message: string;
  severity: PremiumReadinessDashboardIssueSeverity;
  fixAction?: { label: string; href: string };
};

export type PremiumReadinessDashboard = {
  status: "ready" | "warning" | "blocked";
  score: number;
  issues: PremiumReadinessDashboardIssue[];
  /** Erreurs catalogue P2.3 quand le code est reconnu. */
  catalogErrors: GenerationError[];
  dialogueQaSummary: {
    valid: boolean;
    blockingCount: number;
    warningCount: number;
    /** Scores 0–1 (P0.15 — visibles dans le readiness). */
    scores: {
      speakerAnchorScore: number;
      voiceConsistencyScore: number;
      bubbleLengthScore: number;
      expositionScore: number;
      repetitionScore: number;
      emotionalFitScore: number;
      mangaReadabilityScore: number;
    };
  } | null;
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function labelMatches(required: string, candidate: string): boolean {
  const a = norm(required);
  const b = norm(candidate);
  if (!a || !b) return false;
  return b.includes(a) || a.includes(b);
}

function contractDialoguesFingerprint(text: { dialogues: Array<{ speakerName: string; text: string; speakerId?: string }> }): string {
  const rows = text.dialogues
    .filter((d) => d.text?.trim())
    .map((d) => `${(d.speakerId ?? d.speakerName ?? "").trim()}|${d.text.trim()}`)
    .sort();
  return JSON.stringify(rows);
}

function editHref(projectId: string, chapterId: string, wizardStep?: ChapterWizardStepId | null): string {
  const base = `/projects/${projectId}/chapters/${chapterId}/edit`;
  if (wizardStep && CHAPTER_WIZARD_STEP_ORDER.includes(wizardStep)) {
    return `${base}?wizard=${encodeURIComponent(wizardStep)}`;
  }
  return base;
}

export function buildPremiumReadinessDashboard(input: {
  snapshot: ChapterStudioSnapshot;
  projectId: string;
  chapterId: string;
  chapterNumber: number | null;
}): PremiumReadinessDashboard {
  const { snapshot, projectId, chapterId, chapterNumber } = input;
  const premiumOnly = isPipelineV3PremiumOnlyEnabled();
  const core = buildChapterReadinessReport(snapshot);
  const data = snapshot.data;

  const issues: PremiumReadinessDashboardIssue[] = [];
  const catalogErrors: GenerationError[] = [];

  const pushCatalog = (
    code: Parameters<typeof generationErrorFromCode>[0],
    technical?: string,
    wizardStep?: ChapterWizardStepId | null,
  ) => {
    const fixHref = editHref(projectId, chapterId, wizardStep ?? undefined);
    catalogErrors.push(
      generationErrorFromCode(code, {
        projectId,
        chapterId,
        technicalMessage: technical,
        href: fixHref,
      }),
    );
    const ge = catalogErrors[catalogErrors.length - 1]!;
    issues.push({
      code,
      message: ge.userMessage,
      severity: ge.severity === "blocked" ? "blocked" : "warning",
      fixAction: ge.fixAction,
    });
  };

  const pushRaw = (code: string, message: string, severity: PremiumReadinessDashboardIssueSeverity, fix?: { label: string; href: string }) => {
    issues.push({ code, message, severity, fixAction: fix });
  };

  for (const it of core.blockerItems) {
    const ws = wizardStepFromReadinessIssue(it);
    pushRaw(it.id, it.message, "blocked", {
      label: it.ctaLabel?.trim() || "Corriger",
      href: editHref(projectId, chapterId, ws),
    });
  }
  for (const it of core.warningItems) {
    const ws = wizardStepFromReadinessIssue(it);
    pushRaw(`warn_${it.id}`, it.message, "warning", {
      label: it.ctaLabel?.trim() || "Voir dans le wizard",
      href: editHref(projectId, chapterId, ws),
    });
  }

  if (premiumOnly && !data.chapterIntentContract) {
    pushRaw(
      "INTENT_CONTRACT_REQUIRED",
      "En mode premium, compile l’intention du chapitre (étape Intention du wizard) et enregistre le contrat avant de lancer.",
      "blocked",
      { label: "Affiner l’intention", href: editHref(projectId, chapterId, "intent") },
    );
  } else if (data.chapterIntentContract && typeof data.chapterIntentContract.confidenceScore === "number") {
    if (data.chapterIntentContract.confidenceScore < 0.75) {
      pushCatalog(
        "INTENT_CONFIDENCE_TOO_LOW",
        `Score ${Math.round(data.chapterIntentContract.confidenceScore * 100)} %`,
        "intent",
      );
    }
  }

  const vwRaw = data.visualWorldContract;
  if (vwRaw != null) {
    const parsed = visualWorldContractSchema.safeParse(vwRaw);
    if (!parsed.success) {
      pushCatalog("VISUAL_WORLD_CONTRACT_FAILED", parsed.error.message);
    } else {
      const vw = parsed.data;
      if ((vw.locations?.length ?? 0) === 0 && chapterNumber === 1) {
        pushCatalog("LOCATION_CANON_REQUIRED", "Aucun lieu dans le contrat monde visuel.");
      }

      const ic = data.chapterIntentContract;
      if (ic) {
        for (const creature of ic.requiredCreatures ?? []) {
          const ok =
            (vw.creatures ?? []).some((c) => labelMatches(creature, c.label)) ||
            (vw.beatBindings ?? []).some((b) =>
              (b.creatureIds ?? []).some((id) => (vw.creatures ?? []).some((c) => c.id === id && labelMatches(creature, c.label))),
            );
          if (!ok) {
            pushCatalog("CREATURE_COVERAGE_MISSING", `Créature attendue : « ${creature} »`);
          }
        }
        for (const prop of ic.requiredProps ?? []) {
          const ok = (vw.props ?? []).some((p) => labelMatches(prop, p.canonicalName));
          if (!ok) {
            pushCatalog("PROP_COVERAGE_MISSING", `Objet attendu : « ${prop} »`);
          }
        }
      }
    }
  } else if (chapterNumber === 1 && premiumOnly) {
    pushCatalog("VISUAL_WORLD_CONTRACT_FAILED", "visualWorldContract absent du snapshot.");
  }

  let dialogueQaSummary: PremiumReadinessDashboard["dialogueQaSummary"] = null;
  const blueprints = data.productionPlan?.panelBlueprints;
  if (Array.isArray(blueprints) && blueprints.length > 0) {
    const qaPanels: Parameters<typeof runDialogueQaPremium>[0]["panels"] = [];
    for (const bp of blueprints as Array<Record<string, unknown>>) {
      const panelId = typeof bp.panelId === "string" ? bp.panelId : String(bp.panelId ?? "panel");
      const pick = {
        panelId,
        dialogueLines: (bp.dialogueLines as never) ?? null,
        textContract: bp.textContract as never,
        panelTextBundle: bp.panelTextBundle as never,
        narrationText: typeof bp.narrationText === "string" ? bp.narrationText : undefined,
        sfxCues: bp.sfxCues as never,
      };
      if (isPersistedPanelTextContract(bp.textContract)) {
        const fromFragments = buildPanelTextContractFromBlueprintTextFields(pick as never);
        if (contractDialoguesFingerprint(bp.textContract as never) !== contractDialoguesFingerprint(fromFragments)) {
          pushCatalog("PANEL_TEXT_DESYNC", `Panel ${bp.panelNumber ?? panelId}`, "dialogues");
          break;
        }
      }
      const resolved = resolvePanelTextContractFromBlueprintPremium(pick as never);
      const vis =
        Array.isArray(bp.mustShowCharacterIds) && (bp.mustShowCharacterIds as string[]).length > 0
          ? (bp.mustShowCharacterIds as string[])
          : Array.isArray(bp.requiredCharacterIds) && (bp.requiredCharacterIds as string[]).length > 0
            ? (bp.requiredCharacterIds as string[])
            : Array.isArray(bp.requiredCharacters)
              ? (bp.requiredCharacters as string[])
              : [];
      const off =
        bp.dialogueCarrier === "offscreen_allowed" && typeof bp.speakerAnchorCharacterId === "string"
          ? [bp.speakerAnchorCharacterId]
          : [];
      qaPanels.push({
        panelNumber: typeof bp.panelNumber === "number" ? bp.panelNumber : 1,
        text: resolved,
        visibleCharacterIds: vis,
        offscreenAllowedSpeakerIds: off,
      });
    }
    const qa = runDialogueQaPremium({ panels: qaPanels });
    dialogueQaSummary = {
      valid: qa.valid,
      blockingCount: qa.issues.filter((i) => i.severity === "error").length,
      warningCount: qa.issues.filter((i) => i.severity === "warning").length,
      scores: qa.scores,
    };
    const missingSpeakerId = qa.issues.find((i) => i.severity === "error" && i.code === "DIALOGUE_SPEAKER_ID_MISSING");
    if (missingSpeakerId) {
      pushCatalog("DIALOGUE_SPEAKER_UNKNOWN", missingSpeakerId.message, "dialogues");
    } else {
      const firstBlocking = qa.issues.find((i) => i.severity === "error");
      if (firstBlocking) {
        pushRaw(firstBlocking.code, firstBlocking.message, "blocked", {
          label: "Corriger le script",
          href: editHref(projectId, chapterId, "dialogues"),
        });
      }
    }
  }

  const blocked = issues.filter((i) => i.severity === "blocked").length;
  const warned = issues.filter((i) => i.severity === "warning").length;
  const status: PremiumReadinessDashboard["status"] =
    blocked > 0 ? "blocked" : warned > 0 ? "warning" : "ready";
  const score = Math.max(
    0,
    Math.min(100, (core.preparationScore ?? 0) - blocked * 12 - warned * 4),
  );

  return {
    status,
    score,
    issues,
    catalogErrors,
    dialogueQaSummary,
  };
}
