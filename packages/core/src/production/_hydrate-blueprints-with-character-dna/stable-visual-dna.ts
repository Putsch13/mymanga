import type { CharacterVisualDna } from "../../types/generation-debug-snapshot";

const STABLE_VISUAL_EXCERPT_KEYS = [
  "faceShape",
  "skinTone",
  "hairColor",
  "eyeColor",
  "hairStyle",
  "hairLength",
  "hairTexture",
  "eyeShape",
  "eyeSize",
  "eyebrowStyle",
  "noseStyle",
  "mouthStyle",
  "jawline",
  "silhouetteType",
  "silhouette",
  "scars",
  "tattoos",
  "accessories",
  "fixedAccessories",
  "perceivedAge",
] as const;

const VISUAL_CANON_EXCERPT_MAX = 320;

/** Compacte `stableVisualDNA` pour prompts (ordre stable de clés). */
export function excerptFromStableVisualDNA(stable: unknown): string | null {
  if (!stable || typeof stable !== "object" || Array.isArray(stable)) return null;
  const r = stable as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of STABLE_VISUAL_EXCERPT_KEYS) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) {
      parts.push(`${k}: ${v.trim()}`);
    } else if (Array.isArray(v) && v.length > 0) {
      const joined = v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim())
        .join(", ");
      if (joined) parts.push(`${k}: ${joined}`);
    }
    if (parts.join("; ").length >= VISUAL_CANON_EXCERPT_MAX) break;
  }
  if (parts.length === 0) return null;
  const out = parts.join("; ").trim();
  return out.length > VISUAL_CANON_EXCERPT_MAX ? out.slice(0, VISUAL_CANON_EXCERPT_MAX) : out;
}

function stableScalarString(r: Record<string, unknown>, key: string): string | null {
  const v = r[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && v.length > 0) {
    const joined = v
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim())
      .join(", ");
    return joined || null;
  }
  return null;
}

/**
 * Extrait les champs structurés du configurateur (`Character.stableVisualDNA`)
 * vers les propriétés typées de `CharacterVisualDna` (prompts / preflight).
 */
export function visualDnaTraitFieldsFromStableVisualDNA(
  stable: unknown,
): Partial<CharacterVisualDna> {
  if (!stable || typeof stable !== "object" || Array.isArray(stable)) return {};
  const r = stable as Record<string, unknown>;
  const out: Partial<CharacterVisualDna> = {};
  const put = (field: keyof CharacterVisualDna, ...keys: string[]) => {
    for (const k of keys) {
      const s = stableScalarString(r, k);
      if (s) {
        (out as Record<string, string>)[field as string] = s;
        return;
      }
    }
  };
  put("hairColor", "hairColor");
  put("eyeColor", "eyeColor");
  put("faceShape", "faceShape");
  put("skinTone", "skinTone");
  put("hairStyle", "hairStyle");
  put("hairLength", "hairLength");
  put("hairTexture", "hairTexture");
  put("eyeShape", "eyeShape");
  put("eyeSize", "eyeSize");
  put("eyebrowStyle", "eyebrowStyle");
  put("noseStyle", "noseStyle");
  put("mouthStyle", "mouthStyle");
  put("jawline", "jawline");
  put("perceivedAge", "perceivedAge");
  const silhouette = stableScalarString(r, "silhouetteType") ?? stableScalarString(r, "silhouette");
  if (silhouette) out.silhouetteType = silhouette;
  const bodyType = stableScalarString(r, "bodyType");
  if (bodyType) out.bodyType = bodyType;
  const stableStringArray = (key: string): string[] => {
    const v = r[key];
    if (Array.isArray(v)) {
      return v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
    }
    if (typeof v === "string" && v.trim()) return [v.trim()];
    return [];
  };
  const scarsArr = stableStringArray("scars");
  const tattoosArr = stableStringArray("tattoos");
  const accArr = [...stableStringArray("accessories"), ...stableStringArray("fixedAccessories")];
  if (scarsArr.length) out.scars = scarsArr;
  if (tattoosArr.length) out.tattoos = tattoosArr;
  if (accArr.length) out.accessories = [...new Set(accArr)];
  const scars = stableScalarString(r, "scars");
  const tattoos = stableScalarString(r, "tattoos");
  const marks = [scars, tattoos].filter(Boolean).join(" ; ");
  if (marks) out.distinctiveMarksLine = marks;
  const acc = stableScalarString(r, "accessories");
  const facc = stableScalarString(r, "fixedAccessories");
  const accLine = [acc, facc].filter(Boolean).join(" ; ");
  if (accLine) out.accessoriesLine = accLine;
  return out;
}
