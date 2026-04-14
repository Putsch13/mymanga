/**
 * NPC Descriptor Builder — NPC-2
 *
 * Construit des descriptions visuelles concises pour les PNJ récurrents,
 * prêtes à être injectées dans les prompts de génération d'images.
 */

export interface NpcProfileLike {
  shortVisualCore?: string | null;
  outfitSignature?: string | null;
  importanceLevel?: string | null;
  appearanceCount?: number;
  silhouetteSignature?: string | null;
  accessoryMarker?: string | null;
  locationId?: string | null;
}

/**
 * Construit une description visuelle concise d'un PNJ pour injection dans un prompt.
 * Format : "young woman, short black hair, red jacket, glasses, background character"
 */
export function buildNpcPromptDescriptor(profile: NpcProfileLike): string {
  const parts: string[] = [];

  if (profile.shortVisualCore) parts.push(profile.shortVisualCore);
  if (profile.outfitSignature) parts.push(`wearing ${profile.outfitSignature}`);
  if (profile.accessoryMarker) parts.push(`with ${profile.accessoryMarker}`);

  const importanceLabel =
    profile.importanceLevel === "recurring"
      ? "recurring background character"
      : profile.importanceLevel === "important"
        ? "notable background character"
        : "background extra";
  parts.push(importanceLabel);

  return parts.filter(Boolean).join(", ");
}

/**
 * Sélectionne les N PNJ les plus pertinents pour une scène donnée
 * (selon le lieu et l'importance).
 */
export function selectNpcsForScene(
  profiles: NpcProfileLike[],
  locationId: string | null,
  maxCount = 3,
): NpcProfileLike[] {
  return profiles
    .filter(
      (p) =>
        !locationId ||
        (p as { locationId?: string | null }).locationId === locationId ||
        (p as { locationId?: string | null }).locationId === null ||
        (p as { locationId?: string | null }).locationId === undefined,
    )
    .sort((a, b) => (b.appearanceCount ?? 0) - (a.appearanceCount ?? 0))
    .slice(0, maxCount);
}

/**
 * Construit un bloc de prompt NPC pour injection directe dans composeMangaPanelPrompt.
 * Retourne null si aucun PNJ n'est pertinent.
 */
export function buildNpcPresenceBlock(
  profiles: NpcProfileLike[],
  locationId: string | null,
  maxCount = 3,
): string[] | null {
  const selected = selectNpcsForScene(profiles, locationId, maxCount);
  if (selected.length === 0) return null;

  const descriptors = selected
    .map(buildNpcPromptDescriptor)
    .filter(Boolean);

  return descriptors.length > 0 ? descriptors : null;
}
