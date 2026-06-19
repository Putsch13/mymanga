/**
 * Remappe un libellé de lieu brut vers une entrée canonique (nom + description)
 * si match par nom / alias (substring).
 */

export type CanonicalLocationRef = {
  name: string;
  description?: string | null;
  aliases?: string[];
};

export function resolveCanonicalLocation(
  locations: readonly CanonicalLocationRef[] | null | undefined,
  rawLocation: string | null | undefined,
): string | null {
  const input = rawLocation?.trim();
  if (!input) return null;
  const lowered = input.toLowerCase();
  for (const loc of locations ?? []) {
    const names = [loc.name, ...(loc.aliases ?? [])].filter(Boolean).map((value) => value.toLowerCase());
    if (names.some((name) => lowered.includes(name) || name.includes(lowered))) {
      return loc.description ? `${loc.name} — ${loc.description}` : loc.name;
    }
  }
  return input;
}
