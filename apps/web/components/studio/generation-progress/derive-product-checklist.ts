/**
 * Checklist "produit" du board génération — vue parallèle aux étapes
 * techniques Inngest, pour donner un signal compréhensible côté utilisateur
 * (Histoire analysée → Plan manga → Corrections auto → Dialogues → Reader).
 *
 * P1.4.
 */
import type { ChecklistRow, GenerationProgressJobSnapshot } from "./types";

export function stepStatusByKey(
  steps: Array<{ key: string; status?: string }>,
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const s of steps) {
    m[s.key] = s.status ?? "queued";
  }
  return m;
}

export interface DeriveProductChecklistArgs {
  job: GenerationProgressJobSnapshot | null | undefined;
  jobRunning: boolean;
  jobTerminal: boolean;
  jobFailed: boolean;
  currentStep: string | null | undefined;
  statsCompleted: number;
  statsFailed: number;
  statsPending: number;
  statsGenerating: number;
  effectiveTotal: number;
}

export function deriveProductChecklist(input: DeriveProductChecklistArgs): ChecklistRow[] {
  const {
    job,
    jobRunning,
    jobTerminal,
    jobFailed,
    currentStep,
    statsCompleted,
    statsFailed,
    statsPending,
    statsGenerating,
    effectiveTotal,
  } = input;
  const steps = job?.output?.steps ?? [];
  const sm = stepStatusByKey(steps);
  const prepKeys = new Set([
    "build_context",
    "generate_bundle",
    "continuity_pass",
    "persist_chapter",
    "story_coherence_pass",
    "shot_plan",
  ]);
  const prepSteps = steps.filter((s) => prepKeys.has(s.key));
  const gen = sm["generate_images"];
  const mem = sm["update_memory"];
  const prepDone =
    prepSteps.length > 0
      ? prepSteps.every((s) => sm[s.key] === "completed")
      : gen === "completed" || gen === "running" || mem === "completed" || jobTerminal;
  const prepFailed = prepSteps.some((s) => sm[s.key] === "failed");
  const prepActive =
    jobRunning &&
    !prepFailed &&
    !prepDone &&
    (prepSteps.some((s) => sm[s.key] === "running") || (steps.length === 0 && !gen));

  const genDone = gen === "completed";
  const genFailed = gen === "failed";
  const genActive = gen === "running" || statsGenerating > 0;

  const hasRecovery = steps.some((s) => s.key === "recovery_pass");
  const rec = sm["recovery_pass"];
  const recDone = !hasRecovery ? genDone : rec === "completed";
  const recFailed = rec === "failed";
  const recActive = hasRecovery && rec === "running";

  const memDone = mem === "completed";
  const memFailed = mem === "failed";
  const memActive = mem === "running";

  const panelsSettled =
    statsPending === 0 && statsCompleted + statsFailed >= effectiveTotal && effectiveTotal > 0;
  const exportReady =
    jobTerminal && !jobFailed && panelsSettled && statsCompleted + statsFailed > 0;

  return [
    {
      id: "prep",
      label: "Histoire analysée",
      hint: "Contexte narratif, personnages, décors verrouillés",
      state: prepFailed
        ? "error"
        : prepDone
          ? "done"
          : prepActive
            ? "active"
            : jobRunning
              ? "pending"
              : "pending",
    },
    {
      id: "panels",
      label: `Plan manga — ${effectiveTotal} panels`,
      hint: `${statsCompleted} générés / ${statsFailed} échoués / ${statsPending} en attente`,
      state: genFailed
        ? "error"
        : genDone
          ? "done"
          : genActive
            ? "active"
            : prepDone && jobRunning
              ? "active"
              : prepDone
                ? "pending"
                : "pending",
    },
    {
      id: "fix",
      label: "Corrections automatiques",
      hint: "Réparation des panels incohérents",
      state: recFailed
        ? "error"
        : recDone
          ? "done"
          : recActive
            ? "active"
            : genDone && hasRecovery
              ? "pending"
              : genDone
                ? "done"
                : "pending",
    },
    {
      id: "memory",
      label: "Dialogues & mise en page",
      hint: "Composition finale des bulles et traces narratives",
      state: memFailed
        ? "error"
        : memDone
          ? "done"
          : memActive
            ? "active"
            : recDone && jobRunning
              ? "active"
              : recDone
                ? "pending"
                : "pending",
    },
    {
      id: "reader",
      label: "Chapitre prêt à lire",
      hint: "Export des pages pour le lecteur",
      state: jobFailed
        ? "error"
        : exportReady
          ? "done"
          : jobTerminal && !jobFailed && !exportReady && effectiveTotal > 0
            ? "active"
            : "pending",
    },
    {
      id: "done",
      label: "Vérification finale",
      hint: currentStep ? `Dernière étape : ${currentStep}` : undefined,
      state: jobFailed
        ? "error"
        : jobTerminal && !jobFailed && exportReady
          ? "done"
          : jobTerminal && !jobFailed
            ? "active"
            : "pending",
    },
  ];
}

export function phaseLabelForStepKey(key: string): string {
  if (
    key === "build_context" ||
    key === "generate_bundle" ||
    key === "continuity_pass" ||
    key === "persist_chapter"
  ) {
    return "Préparation du job";
  }
  if (key === "story_coherence_pass" || key === "shot_plan") {
    return "Plan & cohérence";
  }
  if (key === "generate_images") {
    return "Génération des panels";
  }
  if (key === "recovery_pass") {
    return "Correction / récupération";
  }
  if (key === "update_memory") {
    return "Mémoire & fin de pipeline";
  }
  return key;
}
