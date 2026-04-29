/**
 * Validation « preuve dans le texte » pour props premium (anti-prop gratuit).
 * Extrait de prop-inference-engine pour réutilisation / tests ciblés.
 * « document / dossier » et « photo / evidence » ont des motifs distincts (preuve fichier vs cliché).
 */

import type { PropVisibilityMode } from "@manga-ai-studio/core";

export type PropTemplateEvidenceShape = {
  canonicalName: string;
  triggers: string[];
};

const USAGE_VERBS_REQUIRING_VISIBILITY = [
  "appelle", "calls",
  "écrit", "writes",
  "tape", "types",
  "vise", "aims",
  "lance", "throws",
  "tranche", "slashes",
  "pirater", "hacks",
  "scanne", "scans",
  "injecte", "injects",
  "brandit", "wields",
  "transmet", "transmits",
  "tire", "shoots",
  "dégaine", "draws",
  "utilise", "uses",
  "saisit", "grabs",
  "sort", "pulls out",
  "branche", "plugs",
];

export const STRICT_PREMIUM_PROP_NAMES = new Set<string>([
  "smartphone",
  "grimoire",
  "talisman",
  "document / dossier",
  "photo / evidence",
  "laptop",
  "tablet",
]);

export function matchesStrictPremiumPropEvidence(template: PropTemplateEvidenceShape, text: string): boolean {
  const lower = text.toLowerCase();
  const key = template.canonicalName.toLowerCase();
  if (key.includes("smartphone")) {
    return /\b(smartphone|téléphone portable|iphone|android)\b/i.test(text)
      || (/\b(appelle|appel|téléphone|sms|texto)\b/i.test(lower) && /\b(portable|mobile)\b/i.test(lower));
  }
  if (key.includes("grimoire")) {
    return /\bgrimoire\b/i.test(text) || /\bspell\s*book\b/i.test(lower);
  }
  if (key.includes("talisman")) {
    return /\btalisman\b/i.test(text) || /\bamulette\b/i.test(lower);
  }
  if (key.includes("photo / evidence")) {
    return /\b(photo|photograph|photographie|preuve|evidence|cliché|cliche)\b/i.test(lower);
  }
  if (key.includes("document")) {
    return /\b(preuve|evidence|dossier|fichier|rapport|affidavit)\b/i.test(lower);
  }
  if (key.includes("laptop") || key.includes("tablet")) {
    return /\b(laptop|ordinateur portable|notebook|tablette|ipad)\b/i.test(lower);
  }
  return template.triggers.some((tr) => {
    const t = tr.toLowerCase();
    if (t.length <= 4 && /^(book|sort|spell|file)$/i.test(tr)) return false;
    return lower.includes(t);
  });
}

export function requiresVisibility(text: string): boolean {
  const lower = text.toLowerCase();
  return USAGE_VERBS_REQUIRING_VISIBILITY.some((v) => lower.includes(v.toLowerCase()));
}

export function makeVisibilityMode(text: string, defaultMode: PropVisibilityMode): PropVisibilityMode {
  if (requiresVisibility(text)) return "used_in_action";
  return defaultMode;
}
