import { moderationOutcomeForImage } from "@manga-ai-studio/moderation";
import type { ContentIntensityLayer } from "@manga-ai-studio/moderation";
import { computeFalSceneAssessment } from "./fal-scene-heuristics";
import type { ImageProviderId, ImageRoutingDecision, ImageWorkflow, RoutingContext } from "./types";

const DEFAULT_FLUX_MODEL = "fal-ai/flux/dev";
const DEFAULT_STABILITY_MODEL = "stable-image-ultra";
const DEFAULT_RUNWARE_MODEL = "runware-custom-stack";

/** Capacités visuelles déclarées par provider */
interface ProviderCapabilities {
  /** Modes look profile supportés */
  supportedLookModes: string[];
  /** Force du support de refs */
  refStrength: "none" | "weak" | "medium" | "strong";
  /** Support style manga BW */
  supportsMangaBw: boolean;
  /** Support anime cel shaded */
  supportsAnimeCel: boolean;
  /** Support action readability */
  supportsActionReadability: boolean;
  /** Support style persistence */
  supportsStylePersistence: boolean;
}

const PROVIDER_CAPABILITIES: Record<ImageProviderId, ProviderCapabilities> = {
  fal: {
    supportedLookModes: ["premium_manga_bw", "premium_manga_color", "anime_cel_shaded_consistent"],
    refStrength: "strong",
    supportsMangaBw: true,
    supportsAnimeCel: true,
    supportsActionReadability: true,
    supportsStylePersistence: true,
  },
  runware: {
    supportedLookModes: ["premium_manga_color", "anime_cel_shaded_consistent"],
    refStrength: "medium",
    supportsMangaBw: false,
    supportsAnimeCel: true,
    supportsActionReadability: true,
    supportsStylePersistence: false,
  },
  stability: {
    supportedLookModes: ["premium_manga_color"],
    refStrength: "medium",
    supportsMangaBw: false,
    supportsAnimeCel: false,
    supportsActionReadability: false,
    supportsStylePersistence: false,
  },
  bfl: {
    supportedLookModes: ["premium_manga_color"],
    refStrength: "weak",
    supportsMangaBw: false,
    supportsAnimeCel: false,
    supportsActionReadability: false,
    supportsStylePersistence: false,
  },
};

/** Vérifier si un provider supporte le look profile demandé */
function providerSupportsLookMode(provider: ImageProviderId, lookMode: string | null | undefined): boolean {
  if (!lookMode) return true;
  return PROVIDER_CAPABILITIES[provider]?.supportedLookModes.includes(lookMode) ?? false;
}

/** Filtrer les providers compatibles avec le look mode */
function filterByLookMode(providers: ImageProviderId[], lookMode: string | null | undefined): ImageProviderId[] {
  if (!lookMode) return providers;
  const compatible = providers.filter((p) => providerSupportsLookMode(p, lookMode));
  // Si aucun compatible, retourner la liste originale (fallback gracieux)
  return compatible.length > 0 ? compatible : providers;
}

function isProviderConfigured(provider: "fal" | "bfl" | "runware" | "stability") {
  if (provider === "fal") return Boolean(process.env.FAL_KEY);
  if (provider === "bfl") return Boolean(process.env.BFL_API_KEY);
  if (provider === "runware") return Boolean(process.env.RUNWARE_API_KEY);
  if (provider === "stability") return Boolean(process.env.STABILITY_API_KEY);
  return false;
}

function pickBestAvailable(
  preferred: Array<"fal" | "runware" | "stability" | "bfl">,
  lookMode?: string | null,
): "fal" | "runware" | "stability" | "bfl" {
  // Filtrer par look mode d'abord si spécifié
  const filtered = lookMode ? filterByLookMode(preferred, lookMode) : preferred;
  for (const p of filtered) {
    if (isProviderConfigured(p)) return p;
  }
  // Fallback : essayer la liste originale si aucun compatible configuré
  for (const p of preferred) {
    if (isProviderConfigured(p)) return p;
  }
  return preferred[0] ?? "fal";
}

function pickFluxWorkflow(ctx: RoutingContext): ImageWorkflow {
  if (ctx.needsInpaint) return "inpaint";
  const assessment = computeFalSceneAssessment(ctx);
  if (assessment.panelCategory === "CHARACTER_LOCK") return "multi_ref";
  if (assessment.panelCategory === "LOCAL_FIX") return ctx.needsPoseVariation ? "controlnet" : "txt2img";
  if (assessment.panelCategory === "ESTABLISHING_ENVIRONMENT") return "txt2img";
  if (ctx.hasCanonReferences && ctx.mode !== "LOCATION_KEYFRAME") return "multi_ref";
  if (ctx.needsPoseVariation) return "controlnet";
  return "txt2img";
}

function assertProviderAllowed(
  provider: "fal" | "bfl" | "runware" | "stability",
  layer: ContentIntensityLayer,
): { ok: true } | { blocked: true; reason: string } {
  const outcome = moderationOutcomeForImage(layer, provider);
  if (outcome.decision === "BLOCK") {
    return { blocked: true, reason: outcome.reasons.join("; ") || "Provider policy" };
  }
  return { ok: true };
}

export type RoutingResult =
  | ImageRoutingDecision
  | { blocked: true; reason: string; textOnlyFallback: true };

/**
 * Routage dynamique multi-backend (spec CTO).
 */
export function decideImageRoute(ctx: RoutingContext): RoutingResult {
  const assessment = computeFalSceneAssessment(ctx);
  const sceneComplexity = assessment.sceneComplexityScore;
  if (ctx.explicitBlocked) {
    return { blocked: true, reason: "Demande explicite refusée", textOnlyFallback: true };
  }

  const layer = ctx.contentIntensityLayer as ContentIntensityLayer;
  if (layer === "RESTRICTED_BLOCKED_VISUAL") {
    return { blocked: true, reason: "RESTRICTED_BLOCKED_VISUAL", textOnlyFallback: true };
  }

  if (ctx.needsInpaint || ctx.mode === "INPAINT_FIX") {
    const gate = assertProviderAllowed("fal", layer);
    if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
    return {
      provider: "fal",
      model: DEFAULT_FLUX_MODEL,
      workflow: "inpaint",
      reason: "Édition locale case / inpaint prioritaire",
      ...assessment,
    };
  }

  if (ctx.preferPhotorealCover && ctx.mode === "COVER_ART") {
    const gate = assertProviderAllowed("stability", layer);
    if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
    return {
      provider: "stability",
      model: DEFAULT_STABILITY_MODEL,
      workflow: ctx.hasCanonReferences ? "img2img" : "txt2img",
      reason: "Cover semi-réaliste premium : Stable Image Ultra",
    };
  }

  if (ctx.contentIntensityLayer === "ADULT_EXPLICIT") {
    if (ctx.adultEngine === "realistic") {
      const provider = pickBestAvailable(["runware", "fal", "stability", "bfl"]);
      const gate = assertProviderAllowed(provider, layer);
      if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
      return {
        provider,
        model:
          provider === "runware"
            ? DEFAULT_RUNWARE_MODEL
            : provider === "fal"
              ? DEFAULT_FLUX_MODEL
              : provider === "stability"
                ? DEFAULT_STABILITY_MODEL
                : "flux-dev",
        workflow: provider === "fal" ? pickFluxWorkflow(ctx) : "txt2img",
        reason: "Adult realistic engine",
        ...assessment,
      };
    }
    const gate = assertProviderAllowed("fal", layer);
    if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
    return {
      provider: "fal",
      model: DEFAULT_FLUX_MODEL,
      workflow: pickFluxWorkflow(ctx),
      reason: "Adult fantasy engine",
      ...assessment,
    };
  }

  if (ctx.isNewCharacter && (ctx.mode === "CHARACTER_SHEET" || ctx.mode === "CHARACTER_EXPRESSION_SET")) {
    if (ctx.contentIntensityLayer === "MATURE_VISUAL" || ctx.contentIntensityLayer === "MATURE_DRAMA") {
      const gate = assertProviderAllowed("runware", layer);
      if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
      return {
        provider: "runware",
        model: DEFAULT_RUNWARE_MODEL,
        workflow: "lora_stack",
        reason: "Nouveau personnage manga : Runware + LoRA stack",
      };
    }
    const gate = assertProviderAllowed("fal", layer);
    if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
    return {
      provider: "fal",
      model: DEFAULT_FLUX_MODEL,
      workflow: "lora_stack",
      reason: "Nouveau personnage manga : FLUX + LoRA stack",
      ...assessment,
    };
  }

  if (ctx.hasCanonReferences && (ctx.mode === "PANEL_FINAL" || ctx.mode === "PANEL_DRAFT")) {
    const provider = pickBestAvailable(["fal", "runware", "stability", "bfl"], ctx.chapterLookProfileMode);
    const gate = assertProviderAllowed(provider, layer);
    if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
    return {
      provider,
      model:
        provider === "fal"
          ? DEFAULT_FLUX_MODEL
          : provider === "runware"
            ? DEFAULT_RUNWARE_MODEL
            : provider === "stability"
              ? DEFAULT_STABILITY_MODEL
              : "flux-dev",
      workflow: provider === "fal"
        ? assessment.panelCategory === "CHARACTER_LOCK"
          ? "multi_ref"
          : "txt2img"
        : "txt2img",
      reason:
        provider === "fal"
          ? assessment.panelCategory === "CHARACTER_LOCK"
            ? `Character lock prioritaire : multi-ref, complexity=${sceneComplexity}`
            : `Scene-first panel : composition prioritaire avec refs dosées, complexity=${sceneComplexity}`
          : `Fallback provider (multi-ref indisponible), complexity=${sceneComplexity}`,
      ...assessment,
    };
  }

  if (ctx.needsPoseVariation || ctx.mode === "POSE_LOCK_VARIATION") {
    const gate = assertProviderAllowed("runware", layer);
    if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
    return {
      provider: "runware",
      model: DEFAULT_RUNWARE_MODEL,
      workflow: "controlnet",
      reason: "Variation de pose : ControlNet-like + refs",
    };
  }

  if (ctx.mode === "STYLE_TRANSFER_VARIATION") {
    const gate = assertProviderAllowed("fal", layer);
    if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
    return {
      provider: "fal",
      model: DEFAULT_FLUX_MODEL,
      workflow: "multi_ref",
      reason: "Style transfer : FLUX multi-reference",
      ...assessment,
    };
  }

  if (ctx.goreStylizedMature) {
    const falOutcome = moderationOutcomeForImage("MATURE_DRAMA", "fal");
    if (falOutcome.decision === "DEGRADE") {
      const gate = assertProviderAllowed("stability", layer);
      if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
      return {
        provider: "stability",
        model: DEFAULT_STABILITY_MODEL,
        workflow: "txt2img",
        reason: "Gore stylisé mature : fallback Stability après filet modération",
      };
    }
  }

  if (ctx.mode === "COVER_ART" && !ctx.preferPhotorealCover) {
    const gate = assertProviderAllowed("fal", layer);
    if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
    return {
      provider: "fal",
      model: DEFAULT_FLUX_MODEL,
      workflow: pickFluxWorkflow(ctx),
      reason: "Cover stylisée premium : FLUX",
      ...assessment,
    };
  }

  const provider = pickBestAvailable(["fal", "runware", "stability", "bfl"], ctx.chapterLookProfileMode);
  const preferFalForComplexScene =
    ctx.mode !== "COVER_ART"
    && sceneComplexity >= 5
    && isProviderConfigured("fal");
  const effectiveProvider = preferFalForComplexScene ? "fal" : provider;
  const gate = assertProviderAllowed(effectiveProvider, layer);
  if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
  return {
    provider: effectiveProvider,
    model:
      effectiveProvider === "fal"
        ? DEFAULT_FLUX_MODEL
        : effectiveProvider === "runware"
          ? DEFAULT_RUNWARE_MODEL
          : effectiveProvider === "stability"
            ? DEFAULT_STABILITY_MODEL
            : "flux-dev",
    workflow: effectiveProvider === "fal" ? pickFluxWorkflow(ctx) : "txt2img",
    reason:
      effectiveProvider === "fal"
        ? `${assessment.panelCategory}: FLUX scene-first, complexity=${sceneComplexity}`
        : `Défaut : fallback provider (clé FAL manquante), complexity=${sceneComplexity}`,
    ...assessment,
  };
}
