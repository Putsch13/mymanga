/**
 * CharacterIdentityContract — Phase 5 source of CHARACTER truth.
 *
 * The pipeline already has multiple character data sources (CharacterFingerprint,
 * stableVisualDNA, CharacterVisualLock, CharacterVisualRef, etc.) but nothing
 * binds them together as a single contract the generator must respect.
 *
 * This type is the per-panel answer to "what does this character look like,
 * what refs must we use, and what is NOT allowed to drift?". It is built once
 * per panel from the character's active visual lock + fingerprint + role, and
 * is passed alongside the CanonicalImagePromptPacket.
 *
 * Key invariants:
 *   1. Every closeup panel MUST supply a `faceReferenceUrl`. If absent, the
 *      panel must fail preflight — not silently generate a new face.
 *   2. Stable DNA (hair color, eye color, permanent markers) may not be
 *      overridden by a per-panel prompt. `forbiddenDrift` captures the axes
 *      where overrides are an error.
 *   3. If the active lock is stale (version older than an uncommitted newer
 *      lock in flight), the caller is responsible for re-resolving the
 *      contract before emitting the panel.
 */

export type CharacterRole = "hero" | "antagonist" | "important_npc" | "npc";

export interface CharacterIdentityContract {
  contractVersion: "1.0.0";
  characterId: string;
  displayName: string;
  role: CharacterRole;
  /** The character's active CharacterVisualLock.version at build time. */
  lockVersion: number | null;
  /** Locked visual DNA that MUST match in the final image. */
  stableVisualDNA: {
    hairColor: string | null;
    eyeColor: string | null;
    permanentMarkers: string[];
  };
  /** Canonical reference URLs kept from the lock. Stable URLs only. */
  canonicalRefUrls: string[];
  /**
   * Face-closeup-only reference URL (front-of-face portrait). Must be
   * supplied for every closeup panel — the preflight refuses to generate a
   * closeup without it.
   */
  faceReferenceUrl: string | null;
  /** Action / full body reference URL, used for wide/medium panels. */
  actionReferenceUrl: string | null;
  /**
   * The visual axes where prompt overrides are forbidden. Populated by
   * Character.requiresCanonApprovalFor + hardTraits + defaultOutfit lock.
   */
  forbiddenDrift: string[];
  /** Tokens the prompt must include (e.g. LoRA trigger word). */
  requiredPromptTokens: string[];
  /** Tokens the prompt must not include (drift triggers). */
  forbiddenPromptTokens: string[];
}

export type ClosefaceGuardResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "closeup_without_face_reference"
        | "contract_missing"
        | "face_reference_not_stable";
      detail: string;
    };

/**
 * Guard used by the panel preflight: if the panel is a closeup shot, the
 * character's contract MUST expose a faceReferenceUrl. This is the place the
 * pipeline refuses to generate a silent face instead of anchoring it.
 */
export function assertCloseupHasFaceReference(input: {
  shotType: string;
  focusCharacterId: string | null;
  contract: CharacterIdentityContract | null;
}): ClosefaceGuardResult {
  const isCloseup =
    input.shotType === "closeup" || input.shotType === "extreme_closeup";
  if (!isCloseup) return { ok: true };
  if (!input.focusCharacterId) return { ok: true };
  if (!input.contract) {
    return {
      ok: false,
      reason: "contract_missing",
      detail: `no CharacterIdentityContract built for ${input.focusCharacterId}`,
    };
  }
  if (!input.contract.faceReferenceUrl) {
    return {
      ok: false,
      reason: "closeup_without_face_reference",
      detail: `character ${input.contract.characterId} is focused on a ${input.shotType} panel but has no faceReferenceUrl`,
    };
  }
  return { ok: true };
}

/**
 * Builds a contract from a raw CharacterVisualLock row + character metadata.
 * The resolver is deliberately tolerant of missing optional columns because
 * the upstream row is plain JSON-ish.
 */
export interface BuildCharacterIdentityContractInput {
  characterId: string;
  displayName: string;
  role: CharacterRole;
  activeLock: {
    version: number;
    faceCloseupAssetUrl: string | null;
    actionRefAssetUrl: string | null;
    canonicalRefUrls: string[];
    triggerWord: string | null;
  } | null;
  stableVisualDNA?: {
    hairColor?: string | null;
    eyeColor?: string | null;
    permanentMarkers?: string[] | null;
  } | null;
  /** List of axes that need canon approval — copied from Character.requiresCanonApprovalFor. */
  requiresCanonApprovalFor?: string[];
  /** Extra tokens forced by LoRA or style (e.g. character trigger word). */
  extraRequiredTokens?: string[];
  /** Tokens known to cause drift (e.g. rival hair color). */
  extraForbiddenTokens?: string[];
}

export function buildCharacterIdentityContract(
  input: BuildCharacterIdentityContractInput,
): CharacterIdentityContract {
  const lock = input.activeLock;
  const permanentMarkers =
    input.stableVisualDNA?.permanentMarkers?.filter(
      (m): m is string => typeof m === "string" && m.trim().length > 0,
    ) ?? [];

  const requiredTokens = [...(input.extraRequiredTokens ?? [])];
  if (lock?.triggerWord) requiredTokens.push(lock.triggerWord);

  const forbiddenDrift = [
    ...(input.requiresCanonApprovalFor ?? []),
    ...(input.stableVisualDNA?.hairColor ? ["hair_color"] : []),
    ...(input.stableVisualDNA?.eyeColor ? ["eye_color"] : []),
    ...(permanentMarkers.length > 0 ? ["permanent_markers"] : []),
  ];

  return {
    contractVersion: "1.0.0",
    characterId: input.characterId,
    displayName: input.displayName,
    role: input.role,
    lockVersion: lock?.version ?? null,
    stableVisualDNA: {
      hairColor: input.stableVisualDNA?.hairColor ?? null,
      eyeColor: input.stableVisualDNA?.eyeColor ?? null,
      permanentMarkers,
    },
    canonicalRefUrls: lock?.canonicalRefUrls ?? [],
    faceReferenceUrl: lock?.faceCloseupAssetUrl ?? null,
    actionReferenceUrl: lock?.actionRefAssetUrl ?? null,
    forbiddenDrift: dedupeStringList(forbiddenDrift),
    requiredPromptTokens: dedupeStringList(requiredTokens),
    forbiddenPromptTokens: dedupeStringList(input.extraForbiddenTokens ?? []),
  };
}

function dedupeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
