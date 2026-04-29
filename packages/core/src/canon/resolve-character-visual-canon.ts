/**
 * Source de vérité unique pour le canon visuel d’un personnage (lecture seule).
 * Ordre : CharacterVisualLock actif → fingerprint → stableVisualDNA → profil de base.
 */

import type {
  Character,
  CharacterVisualLock,
  CharacterVisualRef,
  MediaAsset,
} from "@manga-ai-studio/db";
import type { CharacterImportanceTier } from "../types/chapter-studio";
import { isStableImageUrl } from "../images/stable-image-url";
import { resolveActiveCharacterLoraBinding } from "./character-canon-helpers";

export type CharacterLockStrength = "HARD_LOCK" | "STRONG" | "MEDIUM" | "SOFT";

export type ResolvedCanonicalRef = {
  url: string;
  type: "generated_primary" | "generated_alt" | "user_provided" | "face_closeup" | "action_ref";
  stable: true;
};

export type ResolvedCharacterVisualCanon = {
  characterId: string;
  name: string;
  hardTraits: string[];
  softTraits: string[];
  bodyMarkers: {
    permanent: string[];
    currentInjuries: string[];
    wardrobeDamage: string[];
  };
  outfitContinuity: {
    default: string | null;
    altOutfits: string[];
  };
  canonicalRefs: ResolvedCanonicalRef[];
  loraBindings: Array<{ triggerWord: string | null; url: string | null; scale: number }>;
  fingerprint: Record<string, unknown> | null;
  importanceTier: CharacterImportanceTier;
  lockStrength: CharacterLockStrength;
  source:
    | "visual_lock_active"
    | "character_fingerprint"
    | "stable_visual_dna"
    | "base_profile"
    | "empty";
};

export type CharacterCanonInput = Character & {
  visualLocks?: (CharacterVisualLock & {
    loraAsset?: MediaAsset | null;
    faceCloseupAsset?: MediaAsset | null;
    actionRefAsset?: MediaAsset | null;
    visualRefs?: CharacterVisualRef[];
  })[];
  visualRefs?: CharacterVisualRef[];
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function resolveImportanceTier(role: string | null | undefined): CharacterImportanceTier {
  const r = (role ?? "").toLowerCase();
  if (r === "hero" || r === "protagonist" || r === "main" || r === "main_hero") return "MAIN_HERO";
  if (r === "deuteragonist" || r === "secondary") return "SECONDARY_CORE";
  if (r === "mentor" || r === "important" || r === "important_supporting_character") {
    return "IMPORTANT_SUPPORTING_CHARACTER";
  }
  if (r === "recurring" || r === "named_npc" || r === "pnj") return "RECURRING_NPC";
  return "BACKGROUND_EXTRA";
}

function tierToLockStrength(tier: CharacterImportanceTier): CharacterLockStrength {
  switch (tier) {
    case "MAIN_HERO": return "HARD_LOCK";
    case "SECONDARY_CORE": return "STRONG";
    case "IMPORTANT_SUPPORTING_CHARACTER": return "STRONG";
    case "RECURRING_NPC": return "MEDIUM";
    default: return "SOFT";
  }
}

function collectCanonicalRefs(input: CharacterCanonInput, activeLock: CharacterVisualLock | undefined): ResolvedCanonicalRef[] {
  const out: ResolvedCanonicalRef[] = [];

  if (activeLock) {
    const lockRefs = asStringArray((activeLock as unknown as { canonicalRefUrls?: unknown }).canonicalRefUrls);
    for (const url of lockRefs) {
      if (isStableImageUrl(url)) {
        out.push({ url, type: "generated_primary", stable: true });
      }
    }
  }

  const canonicalMain = (input as unknown as { canonicalImageUrl?: string | null }).canonicalImageUrl;
  if (canonicalMain && isStableImageUrl(canonicalMain)) {
    out.push({ url: canonicalMain, type: "generated_primary", stable: true });
  }

  const refs = input.visualRefs ?? [];
  for (const r of refs) {
    const url = (r as unknown as { imageUrl?: string | null }).imageUrl;
    if (url && isStableImageUrl(url)) {
      const kind = (r as unknown as { kind?: string | null }).kind ?? "generated_alt";
      out.push({
        url,
        type:
          kind === "face_closeup" ? "face_closeup" :
          kind === "action_ref" ? "action_ref" :
          kind === "user_provided" ? "user_provided" :
          "generated_alt",
        stable: true,
      });
    }
  }

  const seen = new Set<string>();
  return out.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

export function resolveCharacterVisualCanon(input: CharacterCanonInput): ResolvedCharacterVisualCanon {
  const locks = input.visualLocks ?? [];
  const activeLock = locks.find((l) => l.isActive === true) ?? undefined;
  const fingerprint = ((): Record<string, unknown> | null => {
    const fp = (input as unknown as { characterFingerprint?: unknown }).characterFingerprint;
    if (fp && typeof fp === "object" && !Array.isArray(fp)) return fp as Record<string, unknown>;
    return null;
  })();
  const stableDNA = asRecord((input as unknown as { stableVisualDNA?: unknown }).stableVisualDNA);
  const visualProfile = asRecord((input as unknown as { visualProfile?: unknown }).visualProfile);
  const bodyState = asRecord((input as unknown as { bodyState?: unknown }).bodyState);
  const wardrobeProfile = asRecord((input as unknown as { wardrobeProfile?: unknown }).wardrobeProfile);

  let hardTraits: string[] = [];
  let softTraits: string[] = [];
  let source: ResolvedCharacterVisualCanon["source"] = "empty";

  if (fingerprint) {
    hardTraits = asStringArray(fingerprint.hardTraits);
    softTraits = asStringArray(fingerprint.softTraits);
    if (hardTraits.length + softTraits.length > 0) {
      source = "character_fingerprint";
    }
  }

  if (source === "empty" && Object.keys(stableDNA).length > 0) {
    hardTraits = [
      ...(stableDNA.hairColor ? [`hair=${stableDNA.hairColor}`] : []),
      ...(stableDNA.eyeColor ? [`eyes=${stableDNA.eyeColor}`] : []),
      ...asStringArray(stableDNA.scars),
      ...asStringArray(stableDNA.tattoos),
      ...asStringArray(stableDNA.fixedAccessories),
    ];
    softTraits = [
      ...(stableDNA.faceShape ? [`face=${stableDNA.faceShape}`] : []),
      ...(stableDNA.silhouette ? [`silhouette=${stableDNA.silhouette}`] : []),
    ];
    if (hardTraits.length + softTraits.length > 0) {
      source = "stable_visual_dna";
    }
  }

  if (source === "empty") {
    const baseHair = (input as unknown as { hairColor?: string | null }).hairColor;
    const baseEyes = (input as unknown as { eyeColor?: string | null }).eyeColor;
    hardTraits = [
      ...(baseHair ? [`hair=${baseHair}`] : []),
      ...(baseEyes ? [`eyes=${baseEyes}`] : []),
    ];
    softTraits = [];
    if (hardTraits.length > 0) source = "base_profile";
  }

  if (activeLock) {
    source = "visual_lock_active";
  }

  const outfitDefault = activeLock?.defaultOutfit
    ?? (input as unknown as { outfitDefault?: string | null }).outfitDefault
    ?? null;
  const altOutfits = activeLock
    ? asStringArray((activeLock as unknown as { altOutfits?: unknown }).altOutfits)
    : asStringArray(wardrobeProfile.altOutfits);

  const permanentMarkers = [
    ...asStringArray(stableDNA.scars),
    ...asStringArray(stableDNA.tattoos),
    ...asStringArray(bodyState.permanentMarks),
    ...asStringArray(visualProfile.permanentMarkers),
  ];
  const currentInjuries = asStringArray(bodyState.currentInjuries);
  const wardrobeDamage = asStringArray(wardrobeProfile.currentDamage);

  const role = (input as unknown as { roleType?: string | null }).roleType ?? null;
  const importanceTier = resolveImportanceTier(role);

  const canonicalRefs = collectCanonicalRefs(input, activeLock);

  const loraBindings: ResolvedCharacterVisualCanon["loraBindings"] = [];
  const resolvedLora = resolveActiveCharacterLoraBinding({
    activeLock: activeLock
      ? {
          triggerWord: activeLock.triggerWord ?? null,
          loraAsset:
            (activeLock.loraAsset as unknown as { publicUrl?: string | null } | null) ?? null,
        }
      : null,
  });
  if (resolvedLora) {
    loraBindings.push(resolvedLora);
  }

  return {
    characterId: input.id,
    name: input.name,
    hardTraits,
    softTraits,
    bodyMarkers: {
      permanent: Array.from(new Set(permanentMarkers)),
      currentInjuries,
      wardrobeDamage,
    },
    outfitContinuity: {
      default: outfitDefault,
      altOutfits,
    },
    canonicalRefs,
    loraBindings,
    fingerprint,
    importanceTier,
    lockStrength: tierToLockStrength(importanceTier),
    source,
  };
}
