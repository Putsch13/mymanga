import {
  resolveCharacterVisualCanon,
  type CharacterCanonInput,
} from "@manga-ai-studio/core";

import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";

interface LoraAttachmentLike {
  weight: number;
  lora: {
    externalId: string;
    weightsMeta: unknown;
  };
}

interface CharacterRefsInput {
  id: string;
  loraAttachments: LoraAttachmentLike[];
}

export interface ActiveLora {
  url: string;
  triggerWord: string;
  scale: number;
}

export interface ResolvedCanonRefs {
  canonSummary: ReturnType<typeof resolveCharacterVisualCanon>;
  /** URLs stables (DB) — non signées, utilisées pour la persistance canonique. */
  stableRefUrls: string[];
  /** URLs signées (provider-temporaires) — utilisées pour appeler le provider. */
  referenceImageUrls: string[];
  activeLoras: ActiveLora[];
}

export async function resolveCharacterCanonRefs(
  character: CharacterRefsInput & CharacterCanonInput,
): Promise<ResolvedCanonRefs> {
  const canonSummary = resolveCharacterVisualCanon(character);
  const stableRefUrls = Array.from(
    new Set(canonSummary.canonicalRefs.map((ref) => ref.url)),
  ).slice(0, 4);

  const signedRefs = await Promise.all(
    stableRefUrls.map(async (u) => (await signSupabaseUrlIfNeeded(u)) ?? u),
  );
  const referenceImageUrls = signedRefs.filter((url): url is string => Boolean(url));

  const activeLoras = character.loraAttachments
    .map((attachment) => {
      const weightsMeta = attachment.lora.weightsMeta as Record<string, unknown>;
      const loraUrl = typeof weightsMeta?.loraUrl === "string" ? weightsMeta.loraUrl : null;
      const triggerWord =
        typeof weightsMeta?.triggerWord === "string"
          ? weightsMeta.triggerWord
          : attachment.lora.externalId;
      return loraUrl
        ? { url: loraUrl, triggerWord, scale: attachment.weight }
        : null;
    })
    .filter((item): item is ActiveLora => Boolean(item))
    .slice(0, 2);

  console.info(
    `[generate-visual] canon_resolved characterId=${character.id} `
    + `source=${canonSummary.source} lockStrength=${canonSummary.lockStrength} `
    + `canonicalRefs=${stableRefUrls.length} hardTraits=${canonSummary.hardTraits.length} `
    + `permanentMarkers=${canonSummary.bodyMarkers.permanent.length}`,
  );

  return { canonSummary, stableRefUrls, referenceImageUrls, activeLoras };
}
