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

/**
 * Valide qu’un prop (typiquement `VisualWorldPropDna`) est ancré au beat et au texte,
 * pour le chemin premium IA-first (pas de prop « gratuit » sans lien).
 */
export function validatePropEvidence(input: {
  prop: unknown;
  beat: unknown;
  panel?: unknown;
  visualWorldContract?: unknown;
}): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const p = input.prop as Record<string, unknown> | null;
  if (!p || typeof p !== "object" || Array.isArray(p)) {
    reasons.push("prop_not_object");
    return { valid: false, reasons };
  }
  const name = typeof p.canonicalName === "string" ? p.canonicalName.trim() : "";
  if (!name) {
    reasons.push("missing_canonical_name");
    return { valid: false, reasons };
  }

  const b = input.beat as Record<string, unknown> | null;
  const beatId =
    typeof b?.beatId === "string" && b.beatId.trim()
      ? b.beatId.trim()
      : typeof b?.id === "string" && b.id.trim()
        ? b.id.trim()
        : "";
  const reqRaw = p.requiredBeatIds;
  const reqBeats = Array.isArray(reqRaw)
    ? reqRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
    : [];

  if (beatId && reqBeats.length > 0 && !reqBeats.includes(beatId)) {
    reasons.push("prop_not_bound_to_beat");
    return { valid: false, reasons };
  }

  /** Index `indexVisualWorldPropsByBeat` : si le prop est déjà rattaché à ce beat, on ne redemande pas une occurrence textuelle. */
  if (beatId && reqBeats.includes(beatId)) {
    return { valid: true, reasons: [] };
  }

  const textParts = [
    b?.summary,
    b?.narrativeFunction,
    b?.whyThisBeatExists,
    b?.dramaticChange,
    ...(Array.isArray(b?.environmentContext) ? b.environmentContext : []),
  ]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const blob = textParts.join(" ").toLowerCase();
  const desc = typeof p.visualDescription === "string" ? p.visualDescription.trim().toLowerCase() : "";

  const nameWords = name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const descWords = desc
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 12);
  const tokens = [...new Set([name.toLowerCase(), ...nameWords, ...descWords])].filter(Boolean);
  const anchored = tokens.some((t) => t.length > 0 && blob.includes(t));
  if (!anchored && blob.length > 0) {
    reasons.push("prop_not_evident_in_beat_text");
    return { valid: false, reasons };
  }

  void input.panel;
  void input.visualWorldContract;
  return { valid: true, reasons: [] };
}
