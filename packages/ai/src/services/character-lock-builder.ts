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
  /**
   * P1-5 — Ref portrait dédiée (closeup visage).
   * Doit pointer vers un crop/rendu spécifiquement portrait. Si absent,
   * on retombe sur `canonicalRefUrls[0]` mais on loggue un warn pour
   * signaler qu'aucune ref closeup dédiée n'existe pour ce character.
   */
  faceCloseupRefUrl?: string | null;
  /**
   * P1-5 — Ref action/full-body dédiée (pose dynamique).
   * Fallback sur canonicalRefUrls[1] puis [0].
   */
  actionRefUrl?: string | null;
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
    faceCloseupRef: resolveFaceCloseupRef(input),
    actionRef: resolveActionRef(input),
  };
}

/**
 * P1-5 — Résout la ref portrait dédiée.
 * Priorité : paramètre explicite `faceCloseupRefUrl` > canonicalRefUrls[0] (avec warn).
 */
function resolveFaceCloseupRef(input: BuilderInput): string | undefined {
  const explicit = safeString(input.faceCloseupRefUrl);
  if (explicit) return explicit;
  const fallback = (input.canonicalRefUrls ?? [])[0];
  if (fallback) {
    console.warn(
      `[character-lock:P1-5] character=${input.characterId} no_dedicated_face_closeup_ref — fallback canonicalRefUrls[0] (peut être full-body, risque de drift sur closeups)`,
    );
    return fallback;
  }
  return undefined;
}

/**
 * P7 — Erreur explicite lorsqu'un closeup premium n'a pas sa face ref
 * dédiée. Le legacy tombait en fallback silencieux sur `canonicalRefUrls[0]`
 * (souvent une full-body), avec drift visible sur closeups héros/npc.
 */
export class MissingDedicatedFaceCloseupRefError extends Error {
  public readonly characterId: string;
  public readonly renderMode: string;
  public readonly panelId?: string | null;
  constructor(characterId: string, renderMode: string, panelId?: string | null) {
    super(
      `missing_dedicated_face_closeup_ref character=${characterId} renderMode=${renderMode} panelId=${panelId ?? "?"} ` +
        `— un panel closeup premium doit avoir une face ref dédiée (générée via /generate-visual/face-closeup). Fallback interdit.`,
    );
    this.name = "MissingDedicatedFaceCloseupRefError";
    this.characterId = characterId;
    this.renderMode = renderMode;
    this.panelId = panelId ?? null;
  }
}

const PANEL_MODES_REQUIRING_DEDICATED_FACE: ReadonlyArray<string> = [
  "hero_closeup",
  "reaction_closeup",
  "npc_closeup",
  "enemy_closeup",
  "dialogue_over_shoulder",
];

/**
 * P7 — Vérifie strictement qu'un panel en renderMode closeup a bien une
 * face ref dédiée pour le personnage principal. Throw si absente. Appelé
 * par le render-pass v3 pour bloquer au lieu de fallback silencieux.
 */
export function assertDedicatedFaceCloseupForPanel(args: {
  characterId: string;
  faceCloseupRefUrl: string | null | undefined;
  renderMode: string;
  panelId?: string | null;
}): void {
  if (!PANEL_MODES_REQUIRING_DEDICATED_FACE.includes(args.renderMode)) return;
  const trimmed = typeof args.faceCloseupRefUrl === "string" ? args.faceCloseupRefUrl.trim() : "";
  if (!trimmed) {
    throw new MissingDedicatedFaceCloseupRefError(
      args.characterId,
      args.renderMode,
      args.panelId,
    );
  }
}

/**
 * P1-5 — Résout la ref action dédiée.
 * Priorité : actionRefUrl > canonicalRefUrls[1] > canonicalRefUrls[0].
 */
function resolveActionRef(input: BuilderInput): string | undefined {
  const explicit = safeString(input.actionRefUrl);
  if (explicit) return explicit;
  const refs = input.canonicalRefUrls ?? [];
  return refs[1] ?? refs[0] ?? undefined;
}

/**
 * P1-5 — Helper pour consommateurs pipeline (image generation) : préfixe la
 * faceCloseupRef en tête de la liste de refs pour un panel closeup.
 * Renvoie la liste nouvelle si une ref portrait dédiée existe ET diffère
 * déjà de la première entrée ; sinon la liste originale inchangée.
 */
export function prependFaceCloseupRefForCloseup(
  shotType: string | null | undefined,
  baseRefs: string[],
  visualLock: { faceCloseupRef?: string | null | undefined } | null | undefined,
): string[] {
  if (!visualLock?.faceCloseupRef) return baseRefs;
  const isCloseup = shotType === "closeup" || shotType === "extreme_closeup" || shotType === "face";
  if (!isCloseup) return baseRefs;
  if (baseRefs[0] === visualLock.faceCloseupRef) return baseRefs;
  return [visualLock.faceCloseupRef, ...baseRefs.filter((r) => r !== visualLock.faceCloseupRef)];
}
