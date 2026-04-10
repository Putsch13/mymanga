import type { CharacterVisualLock } from "@manga-ai-studio/core";

type BuilderInput = {
  characterId: string;
  displayName: string;
  roleType?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  appearance?: string | null;
  outfitDefault?: string | null;
  bodyState?: Record<string, unknown>;
  visualProfile?: Record<string, unknown>;
  wardrobeProfile?: Record<string, unknown>;
  triggerWord?: string | null;
  loraUrl?: string | null;
  canonicalRefUrls?: string[];
  currentState?: Record<string, unknown>;
  version?: number;
};

function compact(parts: Array<string | null | undefined>, max = 5) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .slice(0, max);
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildCharacterVisualLock(input: BuilderInput): CharacterVisualLock {
  const visualProfile = input.visualProfile ?? {};
  const wardrobeProfile = input.wardrobeProfile ?? {};
  const bodyState = input.bodyState ?? {};
  const shortVisualCore = compact([
    input.roleType ? `${input.roleType}` : null,
    input.hairColor ? `${input.hairColor} hair` : safeString(visualProfile.hairColor) ? `${safeString(visualProfile.hairColor)} hair` : null,
    input.eyeColor ? `${input.eyeColor} eyes` : safeString(visualProfile.eyeColor) ? `${safeString(visualProfile.eyeColor)} eyes` : null,
    safeString(visualProfile.faceShape) ? `${safeString(visualProfile.faceShape)} face` : null,
    safeString(visualProfile.silhouetteType) ? `${safeString(visualProfile.silhouetteType)} silhouette` : null,
    input.outfitDefault ?? safeString(wardrobeProfile.defaultOutfit),
    safeString(visualProfile.accessories),
    safeString(bodyState.scars),
  ], 6).join(", ");

  return {
    id: `${input.characterId}:v${input.version ?? 1}`,
    characterId: input.characterId,
    version: input.version ?? 1,
    isActive: true,
    displayName: input.displayName,
    shortVisualCore,
    triggerWord: input.triggerWord ?? undefined,
    loraUrl: input.loraUrl ?? undefined,
    canonicalRefUrls: input.canonicalRefUrls ?? [],
    defaultOutfit: (input.outfitDefault ?? safeString(wardrobeProfile.defaultOutfit)) || undefined,
    altOutfits: compact([
      safeString(wardrobeProfile.altOutfit),
      safeString(wardrobeProfile.formalOutfit),
      safeString(wardrobeProfile.combatOutfit),
    ], 3),
    currentState: input.currentState ?? {},
    injuryState: {
      injuries: Array.isArray(bodyState.currentInjuries) ? bodyState.currentInjuries : [],
      prosthetics: Array.isArray(bodyState.prosthetics) ? bodyState.prosthetics : [],
      scars: safeString(bodyState.scarsCurrent) ? [safeString(bodyState.scarsCurrent)] : [],
    },
    ageVariant: safeString(visualProfile.ageVariant) || undefined,
    faceCloseupRef: (input.canonicalRefUrls ?? [])[0] ?? undefined,
    actionRef: (input.canonicalRefUrls ?? [])[1] ?? (input.canonicalRefUrls ?? [])[0] ?? undefined,
  };
}
