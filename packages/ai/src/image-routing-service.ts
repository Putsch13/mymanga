import { moderationOutcomeForImage } from "@manga-ai-studio/moderation";
import type { ContentIntensityLayer } from "@manga-ai-studio/moderation";
import type { ImageRoutingDecision, ImageWorkflow, RoutingContext } from "./types";

const DEFAULT_FLUX_MODEL = "flux-pro/v1.1";
const DEFAULT_STABILITY_MODEL = "stable-image-ultra";
const DEFAULT_RUNWARE_MODEL = "runware-custom-stack";

function isProviderConfigured(provider: "fal" | "bfl" | "runware" | "stability") {
  if (provider === "fal") return Boolean(process.env.FAL_KEY);
  if (provider === "bfl") return Boolean(process.env.BFL_API_KEY);
  if (provider === "runware") return Boolean(process.env.RUNWARE_API_KEY);
  if (provider === "stability") return Boolean(process.env.STABILITY_API_KEY);
  return false;
}

function pickBestAvailable(
  preferred: Array<"fal" | "runware" | "stability" | "bfl">,
): "fal" | "runware" | "stability" | "bfl" {
  for (const p of preferred) {
    if (isProviderConfigured(p)) return p;
  }
  // Si rien n'est configuré, on garde le premier pour produire une erreur explicite côté provider.
  return preferred[0] ?? "fal";
}

function pickFluxWorkflow(ctx: RoutingContext): ImageWorkflow {
  if (ctx.needsInpaint) return "inpaint";
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
      };
    }
    const gate = assertProviderAllowed("fal", layer);
    if ("blocked" in gate) return { blocked: true, reason: gate.reason, textOnlyFallback: true };
    return {
      provider: "fal",
      model: DEFAULT_FLUX_MODEL,
      workflow: pickFluxWorkflow(ctx),
      reason: "Adult fantasy engine",
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
    };
  }

  if (ctx.hasCanonReferences && (ctx.mode === "PANEL_FINAL" || ctx.mode === "PANEL_DRAFT")) {
    const provider = pickBestAvailable(["fal", "runware", "stability", "bfl"]);
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
      workflow: provider === "fal" ? "multi_ref" : "txt2img",
      reason: provider === "fal" ? "Cohérence personnage existant : multi-ref" : "Fallback provider (multi-ref indisponible)",
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
    };
  }

  const provider = pickBestAvailable(["fal", "runware", "stability", "bfl"]);
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
    workflow: provider === "fal" ? pickFluxWorkflow(ctx) : "txt2img",
    reason: provider === "fal" ? "Défaut : FLUX stylisé" : "Défaut : fallback provider (clé FAL manquante)",
  };
}
