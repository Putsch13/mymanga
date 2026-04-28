/**
 * merge-character-visual-dna.ts
 *
 * P0 — Fusionne le visual DNA d'un personnage depuis plusieurs sources.
 *
 * La chaîne de propagation doit être:
 *   DB Character / Studio Character
 *   → CharacterCanon
 *   → ChapterGenerationContract
 *   → PanelGenerationContract.requiredCharacters
 *   → StoryboardPanel.characterVisualDna
 *   → PanelRenderSpec.visibleCharacters.visualDNA
 *   → Prompt positif
 *   → Prompt négatif anti-drift
 *   → Vision QA expected fingerprint
 *   → SceneImage metadata
 */

export interface MergedCharacterVisualDna {
  eyeColor?: string | null;
  hairColor?: string | null;
  hairStyle?: string | null;
  outfitSignature?: string | null;
  distinctiveTraits?: string[];
  silhouette?: string | null;
  ageAppearance?: string | null;
  bodyType?: string | null;
  skinTone?: string | null;
}

export interface DbCharacterVisualFields {
  hairColor?: string | null;
  eyeColor?: string | null;
  canonSignatureText?: string | null;
  forbiddenVisualDrift?: string[] | null;
}

export interface ContractCharacterVisualDna {
  eyeColor?: string | null;
  hairColor?: string | null;
  hairStyle?: string | null;
  outfitSignature?: string | null;
  distinctiveTraits?: string[];
  silhouette?: string | null;
  ageAppearance?: string | null;
  bodyType?: string | null;
}

export interface StoryboardCharacterVisualDna {
  eyeColor?: string | null;
  hairColor?: string | null;
  hairStyle?: string | null;
  outfitSignature?: string | null;
  distinctiveFeatures?: string[];
}

export interface RenderSpecCharacterVisualDna {
  eyeColor?: string | null;
  hairColor?: string | null;
  hairStyle?: string | null;
  outfitSignature?: string | null;
}

export interface MergeCharacterVisualDnaInput {
  dbCharacter?: DbCharacterVisualFields;
  contractCharacter?: ContractCharacterVisualDna;
  storyboardCharacterDna?: StoryboardCharacterVisualDna;
  renderSpecCharacter?: RenderSpecCharacterVisualDna;
}

export function mergeCharacterVisualDna(input: MergeCharacterVisualDnaInput): MergedCharacterVisualDna {
  const {
    dbCharacter,
    contractCharacter,
    storyboardCharacterDna,
    renderSpecCharacter,
  } = input;

  const result: MergedCharacterVisualDna = {};

  result.hairColor = 
    renderSpecCharacter?.hairColor ??
    storyboardCharacterDna?.hairColor ??
    contractCharacter?.hairColor ??
    dbCharacter?.hairColor ??
    null;

  result.eyeColor = 
    renderSpecCharacter?.eyeColor ??
    storyboardCharacterDna?.eyeColor ??
    contractCharacter?.eyeColor ??
    dbCharacter?.eyeColor ??
    null;

  result.hairStyle = 
    renderSpecCharacter?.hairStyle ??
    storyboardCharacterDna?.hairStyle ??
    contractCharacter?.hairStyle ??
    null;

  result.outfitSignature = 
    renderSpecCharacter?.outfitSignature ??
    storyboardCharacterDna?.outfitSignature ??
    contractCharacter?.outfitSignature ??
    null;

  result.distinctiveTraits = [];
  if (storyboardCharacterDna?.distinctiveFeatures?.length) {
    result.distinctiveTraits.push(...storyboardCharacterDna.distinctiveFeatures);
  }
  if (contractCharacter?.distinctiveTraits?.length) {
    for (const trait of contractCharacter.distinctiveTraits) {
      if (!result.distinctiveTraits.includes(trait)) {
        result.distinctiveTraits.push(trait);
      }
    }
  }
  if (dbCharacter?.canonSignatureText) {
    const parts = dbCharacter.canonSignatureText.split(/[,;]/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed && !result.distinctiveTraits.includes(trimmed)) {
        result.distinctiveTraits.push(trimmed);
      }
    }
  }

  result.silhouette = contractCharacter?.silhouette ?? null;
  result.ageAppearance = contractCharacter?.ageAppearance ?? null;
  result.bodyType = contractCharacter?.bodyType ?? null;

  return result;
}

export function characterVisualDnaToPromptDescription(
  name: string,
  dna: MergedCharacterVisualDna
): string {
  const parts: string[] = [name];

  if (dna.hairColor || dna.hairStyle) {
    const hair = [dna.hairColor, dna.hairStyle].filter(Boolean).join(" ");
    if (hair) parts.push(`${hair} hair`);
  }

  if (dna.eyeColor) {
    parts.push(`${dna.eyeColor} eyes`);
  }

  if (dna.outfitSignature) {
    parts.push(`wearing ${dna.outfitSignature}`);
  }

  if (dna.distinctiveTraits && dna.distinctiveTraits.length > 0) {
    parts.push(dna.distinctiveTraits.slice(0, 3).join(", "));
  }

  if (dna.ageAppearance) {
    parts.push(dna.ageAppearance);
  }

  if (dna.bodyType) {
    parts.push(dna.bodyType);
  }

  return parts.join(", ");
}

export function characterVisualDnaToNegativePrompt(
  name: string,
  dna: MergedCharacterVisualDna
): string[] {
  const negatives: string[] = [];

  if (dna.hairColor) {
    negatives.push(`wrong hair color for ${name}`);
  }

  if (dna.eyeColor) {
    negatives.push(`wrong eye color for ${name}`);
  }

  if (dna.outfitSignature) {
    negatives.push(`wrong outfit for ${name}`);
  }

  if (dna.ageAppearance) {
    negatives.push(`different age for ${name}`);
  }

  if (dna.bodyType) {
    negatives.push(`different body type for ${name}`);
  }

  if (dna.distinctiveTraits && dna.distinctiveTraits.length > 0) {
    negatives.push(`missing distinctive trait for ${name}`);
  }

  return negatives;
}

export function buildVisionQaExpectedFingerprint(
  name: string,
  dna: MergedCharacterVisualDna
): Record<string, string | string[] | null> {
  return {
    name,
    hairColor: dna.hairColor ?? "unspecified",
    eyeColor: dna.eyeColor ?? "unspecified",
    hairStyle: dna.hairStyle ?? "unspecified",
    outfitSignature: dna.outfitSignature ?? "unspecified",
    distinctiveTraits: dna.distinctiveTraits ?? [],
    ageAppearance: dna.ageAppearance ?? "unspecified",
    bodyType: dna.bodyType ?? "unspecified",
  };
}
