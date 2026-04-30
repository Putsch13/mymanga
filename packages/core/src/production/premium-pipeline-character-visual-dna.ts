/**
 * Construit un `CharacterVisualDna` pour le render-pass à partir d’une ligne
 * personnage premium (Prisma / pipeline v3), sans dupliquer la logique
 * d’excerpt `stableVisualDNA` (voir `excerptFromStableVisualDNA`).
 */

import type { CharacterVisualDna } from "../types/generation-debug-snapshot";
import { excerptFromStableVisualDNA, visualDnaTraitFieldsFromStableVisualDNA } from "./hydrate-blueprints-with-character-dna";

export type PremiumPipelineCharacterLike = {
  id: string;
  name: string;
  hairColor?: string | null;
  eyeColor?: string | null;
  hairStyle?: string | null;
  skinTone?: string | null;
  outfitSignature?: string | null;
  accessories?: string[] | null;
  bodyType?: string | null;
  ageApparent?: string | null;
  distinctiveMarks?: string[] | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
  stableVisualDNA?: Record<string, unknown> | null;
};

function joinList(arr: string[] | null | undefined, maxItems: number): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const s = arr
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim())
    .slice(0, maxItems)
    .join("; ");
  return s.length > 0 ? s : null;
}

export function characterVisualDnaForRenderFromPremiumRow(row: PremiumPipelineCharacterLike): CharacterVisualDna {
  const fromStable = visualDnaTraitFieldsFromStableVisualDNA(row.stableVisualDNA ?? null);
  const excerpt = excerptFromStableVisualDNA(row.stableVisualDNA ?? null);
  const distinctiveMarksLine = joinList(row.distinctiveMarks, 14);
  const accessoriesLine = joinList(row.accessories, 10);

  return {
    characterId: row.id,
    displayName: row.name,
    ...fromStable,
    hairColor: row.hairColor?.trim() || fromStable.hairColor || null,
    eyeColor: row.eyeColor?.trim() || fromStable.eyeColor || null,
    hairStyle: row.hairStyle?.trim() || fromStable.hairStyle || null,
    skinTone: row.skinTone?.trim() || fromStable.skinTone || null,
    outfitSignature: row.outfitSignature ?? null,
    canonSignatureText: row.canonSignatureText ?? null,
    forbiddenDrift: Array.isArray(row.forbiddenVisualDrift) ? [...row.forbiddenVisualDrift] : undefined,
    visualCanonExcerpt: excerpt ?? null,
    perceivedAge: row.ageApparent?.trim() || fromStable.perceivedAge || null,
    silhouetteType: row.bodyType?.trim() || fromStable.silhouetteType || null,
    distinctiveMarksLine: distinctiveMarksLine || fromStable.distinctiveMarksLine || null,
    accessoriesLine: accessoriesLine || fromStable.accessoriesLine || null,
  };
}
