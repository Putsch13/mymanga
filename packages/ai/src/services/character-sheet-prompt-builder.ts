/**
 * character-sheet-prompt-builder — prompt minimal et propre pour une
 * CHARACTER_SHEET. Remplace la composition actuelle basée sur
 * `composeCharacterVisualPrompt` + `buildCharacterPromptBundle` qui
 * injectait :
 *   - des blobs JSON sérialisés (`{"defaultOutfit":"..."}`)
 *   - des phrases "Continuity rules for X:" redondantes
 *   - des répétitions outfit/hair/eyes dupliquées via visualProfile + wardrobe
 *   - des champs FR bruts non normalisés
 *
 * Le nouveau builder n'expose QUE :
 *   name, gender, age appearance, body build, face shape, hair, eyes,
 *   skin, outfit, permanent markers, neutral pose, white background, style.
 *
 * Aucune prose libre, aucun JSON, aucune duplication.
 */

export interface CharacterSheetPromptInput {
  name: string;
  gender?: "male" | "female" | "non-binary" | null;
  ageAppearance?: string | null; // e.g. "young adult, early twenties"
  bodyBuild?: string | null; // e.g. "athletic slim"
  faceShape?: string | null;
  hair?: string | null; // "long raven black, straight, mid-back length"
  eyes?: string | null; // "sharp almond, pale violet"
  skin?: string | null; // "warm ivory, matte"
  outfit?: string | null; // "black sleeveless tunic, leather belt, grey trousers"
  permanentMarkers?: string[] | null; // scars, tattoos, prosthetics — ONLY permanent
  style: string; // art style descriptor, e.g. "seinen manga, sharp inking, halftone shading"
}

export interface CharacterSheetPromptOutput {
  positive: string;
  negative: string;
}

const BASELINE_NEGATIVE = [
  "3d render",
  "photorealistic",
  "blurry",
  "extra fingers",
  "deformed hands",
  "duplicate face",
  "text",
  "watermark",
  "logo",
  "chibi",
  "baby face",
].join(", ");

/**
 * Ancrage genre FORT. Un simple token "male"/"female" se fait écraser par les
 * styles intrinsèquement genrés (shōjo, aquarelle douce → féminin par défaut).
 * On renvoie une emphase positive + des négatifs genrés ciblés que les modèles
 * de diffusion exploitent réellement pour bloquer la dérive.
 */
function genderAnchors(gender: "male" | "female" | "non-binary" | null): {
  positive: string | null;
  negative: string[];
} {
  switch (gender) {
    case "male":
      return {
        positive: "a male man, clearly masculine face and body, masculine jawline",
        negative: ["woman", "female", "feminine face", "feminine features", "girl", "breasts", "makeup"],
      };
    case "female":
      return {
        positive: "a female woman, clearly feminine face and body",
        negative: ["man", "male", "masculine jaw", "beard", "mustache", "male body"],
      };
    case "non-binary":
      return { positive: "androgynous appearance", negative: [] };
    default:
      return { positive: null, negative: [] };
  }
}

function cleanString(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Refuse tout ce qui ressemble à du JSON sérialisé ou à une concaténation
  // clef/valeur style "{"defaultOutfit":"..."}". On renvoie null pour
  // forcer l'appelant à passer une string propre.
  if (/^[\{\[]/.test(trimmed) || trimmed.includes('":"')) return null;
  return trimmed;
}

/**
 * Construit un prompt CHARACTER_SHEET minimal et propre.
 *
 * Format de sortie :
 *   "Character sheet: <name>, <gender>, <age appearance>, <build>, <face>, hair: <hair>,
 *    eyes: <eyes>, skin: <skin>, outfit: <outfit>, permanent markers: <markers>,
 *    neutral T-pose, flat white background, full body visible, <style>."
 *
 * Tout champ absent est simplement omis (pas de "null", pas de "undefined").
 */
export function buildCharacterSheetPrompt(
  input: CharacterSheetPromptInput,
): CharacterSheetPromptOutput {
  const parts: string[] = [];
  parts.push(`Character sheet: ${input.name}`);
  const gender = input.gender ?? null;
  const anchors = genderAnchors(gender);
  // Le genre est placé JUSTE après le nom, en emphase, pour primer sur le style.
  if (anchors.positive) parts.push(anchors.positive);
  const ageAppearance = cleanString(input.ageAppearance);
  if (ageAppearance) parts.push(ageAppearance);
  const bodyBuild = cleanString(input.bodyBuild);
  if (bodyBuild) parts.push(`${bodyBuild} build`);
  const faceShape = cleanString(input.faceShape);
  if (faceShape) parts.push(`${faceShape} face`);
  const hair = cleanString(input.hair);
  if (hair) parts.push(`hair: ${hair}`);
  const eyes = cleanString(input.eyes);
  if (eyes) parts.push(`eyes: ${eyes}`);
  const skin = cleanString(input.skin);
  if (skin) parts.push(`skin: ${skin}`);
  const outfit = cleanString(input.outfit);
  if (outfit) parts.push(`outfit: ${outfit}`);
  const markers = (input.permanentMarkers ?? [])
    .map((m) => cleanString(m))
    .filter((m): m is string => Boolean(m));
  if (markers.length > 0) {
    parts.push(`permanent markers: ${markers.join(", ")}`);
  }
  parts.push("neutral front-facing pose");
  parts.push("flat white background");
  parts.push("full body visible");
  parts.push(input.style.trim());

  const positive = parts.join(", ") + ".";
  const negative = [BASELINE_NEGATIVE, ...anchors.negative].join(", ");
  return {
    positive,
    negative,
  };
}
