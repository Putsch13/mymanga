import {
  summarizeGenerationStatuses,
  type GenerationOperationalStatus,
} from "@manga-ai-studio/ai";

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
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.STORAGE_BUCKET);
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
    blockers.push("Le provider image principal a besoin de stockage persistant: configure SUPABASE_SERVICE_ROLE_KEY et STORAGE_BUCKET.");
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

  // P0.4 — V3 premium pipeline nécessite FAL + storage durable
  const canRunV3Premium = hasFal && storageReady && Boolean(process.env.OPENAI_API_KEY);

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
    blockers,
    warnings,
  };
}
