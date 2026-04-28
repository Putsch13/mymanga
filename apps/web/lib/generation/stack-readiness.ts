import {
  summarizeGenerationStatuses,
  type GenerationOperationalStatus,
} from "@manga-ai-studio/ai";
import {
  getPremiumVisualQaConfigStatus,
  isPremiumVisualQaStrictlyRequired,
  resolveSupabaseServerConfig,
} from "@manga-ai-studio/workflow";

type ImageProviderId = "fal" | "runware" | "stability" | "bfl";

const PROVIDER_ORDER: ImageProviderId[] = ["fal", "runware", "stability", "bfl"];

function configuredProviders(): ImageProviderId[] {
  const configured: ImageProviderId[] = [];
  if (process.env.FAL_KEY) configured.push("fal");
  if (process.env.RUNWARE_API_KEY) configured.push("runware");
  if (process.env.STABILITY_API_KEY) configured.push("stability");
  if (process.env.BFL_API_KEY) configured.push("bfl");
  return configured;
}

function preferredProvider(providers: ImageProviderId[]): ImageProviderId | null {
  for (const provider of PROVIDER_ORDER) {
    if (providers.includes(provider)) return provider;
  }
  return null;
}

function providerNeedsStorage(provider: ImageProviderId | null): boolean {
  return provider === "stability" || provider === "bfl";
}

function hasStoragePersistence(): boolean {
  return resolveSupabaseServerConfig() != null;
}

export type GenerationStackStatus = {
  configuredProviders: ImageProviderId[];
  preferredImageProvider: ImageProviderId | null;
  operationalStatus: GenerationOperationalStatus;
  degradedModes: GenerationOperationalStatus[];
  isDegraded: boolean;
  hasOpenAI: boolean;
  hasFal: boolean;
  hasStoragePersistence: boolean;
  allowMockImageProvider: boolean;
  canGenerateImages: boolean;
  canGenerateChapters: boolean;
  /** P0.4 — V3 premium pipeline nécessite FAL + storage */
  canRunV3Premium: boolean;
  /** Prod premium-only : `VISUAL_PANEL_QA_VISION` + `ENABLE_PREMIUM_VISION_QA` à true (voir assertPremiumVisualQaConfig). */
  visionPremiumQaEnvReady: boolean;
  /** Préflight aligné sur le worker `assertPremiumVisualQaConfig` (prod + PIPELINE_V3_PREMIUM_ONLY). */
  premiumVisualQaPreflight: {
    ok: boolean;
    missing: string[];
    strictlyRequired: boolean;
    /** Si true, la route launch/pipeline renverra 400 avant création de job. */
    launchBlocked: boolean;
  };
  blockers: string[];
  warnings: string[];
};

export function getGenerationStackStatus(): GenerationStackStatus {
  const providers = configuredProviders();
  const preferred = preferredProvider(providers);
  const storageReady = hasStoragePersistence();
  const hasFal = providers.includes("fal");
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!process.env.OPENAI_API_KEY) {
    blockers.push("OPENAI_API_KEY manquante: les chapitres retomberaient sur des fallbacks trop génériques.");
  }

  if (providers.length === 0) {
    blockers.push("Aucun provider image réel configuré: FAL_KEY, RUNWARE_API_KEY, STABILITY_API_KEY ou BFL_API_KEY est requis.");
  }

  if (providerNeedsStorage(preferred) && !storageReady) {
    blockers.push(
      "Le provider image principal a besoin de stockage persistant: configure l'URL Supabase, une clé service-role et un bucket (alias: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE, STORAGE_BUCKET|SUPABASE_BUCKET).",
    );
  }

  if (!process.env.INNGEST_EVENT_KEY) {
    warnings.push("INNGEST_EVENT_KEY absent: le fallback sync reste possible, mais le traitement ne passera pas par Inngest.");
  }

  if (process.env.ALLOW_MOCK_IMAGE_PROVIDER === "true" && process.env.NODE_ENV === "production") {
    warnings.push("ALLOW_MOCK_IMAGE_PROVIDER=true en production: comportement non recommande pour un test réel.");
  }

  const operational = summarizeGenerationStatuses([
    !process.env.OPENAI_API_KEY ? "DEGRADED_NO_OPENAI" : "FULLY_OPERATIONAL",
    providers.length === 0 ? "DEGRADED_NO_IMAGE_PROVIDER" : "FULLY_OPERATIONAL",
    providerNeedsStorage(preferred) && !storageReady ? "DEGRADED_STORAGE_MISSING" : "FULLY_OPERATIONAL",
  ]);

  const visionPremiumQaEnvReady =
    process.env.VISUAL_PANEL_QA_VISION === "true" && process.env.ENABLE_PREMIUM_VISION_QA === "true";

  if (process.env.NODE_ENV === "production" && !visionPremiumQaEnvReady) {
    warnings.push(
      "Production premium : définir VISUAL_PANEL_QA_VISION=true et ENABLE_PREMIUM_VISION_QA=true (obligatoire avec assertPremiumVisualQaConfig).",
    );
  }

  const premiumVisualQaConfig = getPremiumVisualQaConfigStatus();
  const productionPremiumOnlyPipeline =
    process.env.NODE_ENV === "production" && process.env.PIPELINE_V3_PREMIUM_ONLY === "true";
  const premiumVisualQaLaunchBlocked =
    productionPremiumOnlyPipeline
    && isPremiumVisualQaStrictlyRequired()
    && !premiumVisualQaConfig.ok;

  if (premiumVisualQaLaunchBlocked) {
    blockers.push(
      "QA visuelle premium (production) : variables manquantes — " +
        `configure ${premiumVisualQaConfig.missing.join(", ")} (ou PREMIUM_VISUAL_QA_REQUIRED=false pour un mode dégradé).`,
    );
  }

  // P0.4 — V3 premium + prod : QA vision explicitement activée + préflight complet premium-only
  const canRunV3Premium =
    hasFal
    && storageReady
    && Boolean(process.env.OPENAI_API_KEY)
    && (process.env.NODE_ENV !== "production" || visionPremiumQaEnvReady)
    && !premiumVisualQaLaunchBlocked;

  return {
    configuredProviders: providers,
    preferredImageProvider: preferred,
    operationalStatus: operational.operationalStatus,
    degradedModes: operational.degradedModes,
    isDegraded: operational.isDegraded,
    hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
    hasFal,
    hasStoragePersistence: storageReady,
    allowMockImageProvider:
      process.env.ALLOW_MOCK_IMAGE_PROVIDER === "true" || process.env.NODE_ENV !== "production",
    canGenerateImages:
      providers.length > 0 && (!preferred || !providerNeedsStorage(preferred) || storageReady),
    canGenerateChapters:
      Boolean(process.env.OPENAI_API_KEY) &&
      providers.length > 0 &&
      (!preferred || !providerNeedsStorage(preferred) || storageReady),
    canRunV3Premium,
    visionPremiumQaEnvReady,
    premiumVisualQaPreflight: {
      ok: premiumVisualQaConfig.ok,
      missing: premiumVisualQaConfig.missing,
      strictlyRequired: isPremiumVisualQaStrictlyRequired(),
      launchBlocked: premiumVisualQaLaunchBlocked,
    },
    blockers,
    warnings,
  };
}
