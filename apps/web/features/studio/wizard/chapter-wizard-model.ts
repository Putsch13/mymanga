/**
 * P0.4 — Modèle du wizard « premier chapitre » : étapes, navigation studio, statuts UI.
 */
import type {
  ChapterReadinessIssue,
  ChapterReadinessReport,
  ChapterStudioData,
  ChapterStudioStep,
} from "@manga-ai-studio/core";
import { dialogueContractSchema, PREMIUM_PANEL_RANGE, validateDialogueContract } from "@manga-ai-studio/core";
import type { ChapterFlowStepId } from "@/components/studio/chapter-studio-flow";

export type ChapterWizardStepId =
  | "intent"
  | "hero"
  | "cast"
  | "decor"
  | "living_world"
  | "style"
  | "plan"
  | "dialogues"
  | "readiness"
  | "generation";

export type WizardStepUiStatus = "ready" | "warning" | "blocked" | "pending";

/** P0.6 — État canon héros (chapitre 1) dérivé du GET personnage après sélection. */
export type HeroWizardReadiness = {
  loaded: boolean;
  hasVisualLock: boolean;
  hasFaceRef: boolean;
  hasOutfit: boolean;
  canonOk: boolean;
};

export type ChapterWizardDeriveExtras = {
  chapterNumber: number | null;
  heroReadiness: HeroWizardReadiness | null;
};

export const CHAPTER_WIZARD_STEP_ORDER: readonly ChapterWizardStepId[] = [
  "intent",
  "hero",
  "cast",
  "decor",
  "living_world",
  "style",
  "plan",
  "dialogues",
  "readiness",
  "generation",
] as const;

/**
 * P1.3 — Chaque issue `buildChapterReadinessReport` pointe vers l’étape wizard la plus pertinente
 * (deep link `?wizard=` depuis le dashboard readiness premium).
 */
export function wizardStepFromReadinessIssue(
  issue: Pick<ChapterReadinessIssue, "step" | "id" | "field">,
): ChapterWizardStepId {
  const { step, id, field } = issue;
  if (step === "intent" || step === "narrative_contract") return "intent";
  if (step === "characters") {
    if (id === "missing_hero_character" || field === "studio-hero-character") return "hero";
    if (id.startsWith("canon_pack_incomplete_")) {
      return field === "studio-hero-character" ? "hero" : "cast";
    }
    return "cast";
  }
  if (step === "canon") {
    if (field === "studio-continuity-notes" || id === "missing_continuity_notes") return "readiness";
    return "decor";
  }
  if (step === "editorial_outline" || step === "production_outline" || step === "production_plan") {
    return "plan";
  }
  if (step === "readiness") return "readiness";
  if (step === "generation" || step === "review") return "generation";
  return "readiness";
}

export const WIZARD_STEP_LABELS: Record<ChapterWizardStepId, string> = {
  intent: "Intention",
  hero: "Héros",
  cast: "Cast",
  decor: "Décors",
  living_world: "Monde vivant",
  style: "Style manga",
  plan: "Plan",
  dialogues: "Dialogues",
  readiness: "Prêt à générer",
  generation: "Génération",
};

/** Cible de navigation wizard → flow studio + scroll optionnel (`data-studio-field`). */
export type WizardStepNavTarget = {
  flowStep: ChapterFlowStepId;
  studioStep: ChapterStudioStep;
  scrollFieldId?: string;
};

export const WIZARD_STEP_NAV: Record<ChapterWizardStepId, WizardStepNavTarget> = {
  intent: { flowStep: "brief", studioStep: "intent", scrollFieldId: "studio-short-pitch" },
  hero: { flowStep: "cast_canon", studioStep: "characters", scrollFieldId: "studio-wizard-hero-panel" },
  cast: { flowStep: "cast_canon", studioStep: "characters", scrollFieldId: "studio-wizard-secondary-cast" },
  decor: { flowStep: "cast_canon", studioStep: "characters", scrollFieldId: "studio-location" },
  living_world: { flowStep: "cast_canon", studioStep: "characters", scrollFieldId: "studio-wizard-living-world" },
  style: { flowStep: "cast_canon", studioStep: "characters", scrollFieldId: "studio-wizard-visual-style" },
  plan: { flowStep: "plan", studioStep: "production_plan", scrollFieldId: "studio-plan-contract-overview" },
  dialogues: { flowStep: "plan", studioStep: "production_plan", scrollFieldId: "studio-chapter-dialogues" },
  readiness: {
    flowStep: "generation_review",
    studioStep: "readiness",
    scrollFieldId: "studio-premium-readiness-dashboard",
  },
  generation: { flowStep: "generation_review", studioStep: "generation", scrollFieldId: "studio-chapter-generation-launcher" },
};

export function studioStepToWizardStepId(
  step: ChapterStudioStep,
  opts?: { draft?: ChapterStudioData | null; flowStep?: ChapterFlowStepId },
): ChapterWizardStepId {
  const flow = opts?.flowStep;
  const pinned = opts?.draft?.chapterWizard?.currentStep;
  if (
    flow === "cast_canon"
    && pinned
    && CHAPTER_WIZARD_STEP_ORDER.includes(pinned as ChapterWizardStepId)
    && (step === "characters" || step === "canon")
  ) {
    return pinned as ChapterWizardStepId;
  }
  if (step === "intent" || step === "narrative_contract") return "intent";
  if (step === "characters" || step === "canon") return "cast";
  if (step === "editorial_outline" || step === "production_outline") return "plan";
  if (step === "production_plan") return "plan";
  if (step === "readiness") return "readiness";
  if (step === "generation" || step === "review") return "generation";
  return "intent";
}

export function deriveWizardStepStatuses(
  draft: ChapterStudioData,
  readiness: ChapterReadinessReport | null | undefined,
  extras?: ChapterWizardDeriveExtras | null,
): Record<ChapterWizardStepId, WizardStepUiStatus> {
  const r = {} as Record<ChapterWizardStepId, WizardStepUiStatus>;
  for (const id of CHAPTER_WIZARD_STEP_ORDER) {
    r[id] = "pending";
  }

  const pitch = draft.intent?.shortPitch?.trim() ?? "";
  const ic = draft.chapterIntentContract;
  if (!pitch) r.intent = "blocked";
  else if (pitch.length < 8) r.intent = "warning";
  else if (!ic) r.intent = "warning";
  else if (ic.confidenceScore < 0.75) r.intent = "blocked";
  else r.intent = "ready";

  const heroId = draft.characterSelection?.heroCharacterId?.trim();
  if (!heroId) r.hero = "blocked";
  else if (extras?.chapterNumber === 1) {
    const hr = extras.heroReadiness;
    if (!hr) r.hero = "warning";
    else if (!hr.loaded) r.hero = "warning";
    else if (!hr.hasVisualLock) r.hero = "blocked";
    else if (!hr.hasFaceRef || !hr.hasOutfit) r.hero = "warning";
    else if (!hr.canonOk) r.hero = "warning";
    else r.hero = "ready";
  } else {
    r.hero = "ready";
  }

  const active = draft.characterSelection?.activeCharacterIds?.length ?? 0;
  r.cast = active >= 2 ? "ready" : active === 1 ? "warning" : "blocked";

  const locCount = draft.locationCanons?.length ?? 0;
  const vwLocs = draft.visualWorldContract?.locations?.length ?? 0;
  if (extras?.chapterNumber === 1) {
    if (vwLocs > 0) r.decor = "ready";
    else if (locCount > 0) r.decor = "warning";
    else r.decor = "blocked";
  } else {
    r.decor = locCount > 0 || vwLocs > 0 ? "ready" : "warning";
  }

  const ce = draft.chapterEntities;
  const ceTotal =
    (ce?.npcs?.length ?? 0)
    + (ce?.creatures?.length ?? 0)
    + (ce?.props?.length ?? 0)
    + (ce?.vehicles?.length ?? 0)
    + (ce?.factions?.length ?? 0);
  const vwEntities =
    (draft.visualWorldContract?.npcGroups?.length ?? 0)
    + (draft.visualWorldContract?.creatures?.length ?? 0)
    + (draft.visualWorldContract?.props?.length ?? 0)
    + (draft.visualWorldContract?.vehicles?.length ?? 0)
    + (draft.visualWorldContract?.factions?.length ?? 0);
  const registryEntities =
    (draft.entityRegistry?.namedEntities?.length ?? 0)
    + (draft.entityRegistry?.temporaryEntities?.length ?? 0);
  const intentWorldHints =
    (draft.chapterIntentContract?.requiredNpcs?.length ?? 0)
    + (draft.chapterIntentContract?.requiredCreatures?.length ?? 0)
    + (draft.chapterIntentContract?.requiredProps?.length ?? 0);
  const covered = ceTotal > 0 || vwEntities > 0 || registryEntities > 0;
  if (extras?.chapterNumber === 1 && intentWorldHints > 0 && !covered) {
    r.living_world = "blocked";
  } else {
    r.living_world = covered ? "ready" : "warning";
  }

  if (extras?.chapterNumber === 1) {
    const sc = draft.chapterVisualStyleContract;
    if (!sc?.format || !sc.colorMode || !sc.styleGenre?.trim()) r.style = "blocked";
    else r.style = "ready";
  } else {
    r.style = draft.chapterLookProfile?.mode ? "ready" : "warning";
  }

  const bp = readiness?.panelBlueprintCount ?? draft.productionPlan?.panelBlueprints?.length ?? 0;
  const min = readiness?.imageCounts.minimumImages ?? draft.productionPlan?.minimumImages ?? PREMIUM_PANEL_RANGE.min;
  if (bp >= min && min > 0) r.plan = "ready";
  else if (bp > 0) r.plan = "warning";
  else r.plan = "blocked";

  // P1.2 — Dialogues : contrat studio validé, sinon heuristique sur les blueprints (characterId si texte).
  if (r.plan !== "ready") {
    r.dialogues = "pending";
  } else {
    const blueprints = draft.productionPlan?.panelBlueprints;
    const panelIds =
      Array.isArray(blueprints)
        ? (blueprints as Array<{ panelId?: unknown }>)
            .map((bp) => (typeof bp.panelId === "string" && bp.panelId.length > 0 ? bp.panelId : null))
            .filter((id): id is string => Boolean(id))
        : [];
    const characterIds =
      draft.characterSelection?.activeCharacterIds?.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ) ?? [];

    const parsedContract = dialogueContractSchema.safeParse(draft.chapterDialogueContract);
    if (parsedContract.success) {
      const val = validateDialogueContract(parsedContract.data, {
        panelIds: panelIds.length > 0 ? panelIds : undefined,
        characterIds: characterIds.length > 0 ? characterIds : undefined,
        allowFloating: true,
      });
      const hardErrors = val.issues.filter((i) => i.severity === "error");
      const soft = val.issues.filter((i) => i.severity === "warning");
      if (hardErrors.length > 0) {
        r.dialogues = "blocked";
      } else if (soft.length > 0 || parsedContract.data.totalLines === 0) {
        r.dialogues = "warning";
      } else {
        r.dialogues = "ready";
      }
    } else {
      let linesTotal = 0;
      let linesAnchored = 0;
      if (Array.isArray(blueprints)) {
        for (const bp of blueprints as Array<{
          dialogueLines?: Array<{ characterId?: string; text?: string }> | null;
        }>) {
          const dl = bp.dialogueLines;
          if (!Array.isArray(dl)) continue;
          for (const line of dl) {
            const t = typeof line.text === "string" ? line.text.trim() : "";
            if (!t) continue;
            linesTotal++;
            if (typeof line.characterId === "string" && line.characterId.length > 0) linesAnchored++;
          }
        }
      }
      if (linesTotal === 0) {
        r.dialogues = "warning";
      } else if (linesAnchored < linesTotal) {
        r.dialogues = "blocked";
      } else {
        r.dialogues = "ready";
      }
    }
  }

  if (readiness?.status === "blocked") r.readiness = "blocked";
  else if (readiness?.status === "ready") r.readiness = "ready";
  else r.readiness = readiness ? "warning" : "pending";

  const planCountsReady = bp >= min && min > 0;
  if (readiness?.status === "ready" && planCountsReady) {
    if (r.dialogues === "blocked") {
      r.generation = "blocked";
    } else if (r.dialogues === "warning" || r.readiness === "warning") {
      r.generation = "warning";
    } else {
      r.generation = "ready";
    }
  } else {
    r.generation = "pending";
  }

  return r;
}
