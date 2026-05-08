/**
 * FalPromptFlattener — Sprint A
 *
 * Problème résolu :
 *   Le `CanonicalImagePromptPacket.finalEnglishStructuredPrompt` est formaté
 *   avec des sections `[TAG] contenu\n[TAG2] contenu\n...`. Cette forme
 *   est pensée pour le LLM narratif + debug humain, mais les modèles de
 *   diffusion (FLUX, SDXL, etc.) ne parsent pas ces tags et peuvent même
 *   être déstabilisés par les crochets, sauts de ligne, et métadonnées
 *   narratives (classification contenu, contexte chapitre) qui diluent le
 *   signal visuel.
 *
 * Ce module produit un prompt FAL-optimisé :
 *   - commence TOUJOURS par `manga panel, <style tokens denses>`
 *   - concatène virgules + sujet + action + environnement + continuité
 *   - SUPPRIME les métadonnées non-visuelles (classification, contexte
 *     narratif, rôle dans le beat)
 *   - compacte : longueur max ≈ 1200 chars (configurable)
 *
 * Invariants testés :
 *   - le prompt commence par "manga panel" (les 50 premiers chars)
 *   - aucun `[TAG]` résiduel
 *   - aucun saut de ligne (sauf strict minimum)
 *   - longueur ≤ maxLength
 *   - les tokens visuels critiques sont présents (sujet, env, action)
 */

import type { PromptSection } from "@manga-ai-studio/core";

export interface FlattenOptions {
  /** Longueur max du prompt final. Default 1200. */
  maxLength?: number;
  /** Séparateur entre fragments. Default ", ". */
  separator?: string;
  /** Format projet pour adapter l'en-tête (manga vs webtoon). Default "manga". */
  format?: "manga" | "webtoon";
}

/**
 * Tags non-visuels qui ne doivent PAS apparaître dans le prompt diffusion.
 * Ils restent dans `finalEnglishStructuredPrompt` pour le debug humain et
 * les logs, mais sont filtrés avant envoi au provider.
 */
const NON_VISUAL_TAGS = new Set<PromptSection["tag"]>([
  "CONTENT_CLASSIFICATION",
  "STORY_CONTEXT",
  "DIALOGUE_CONTEXT",
]);

/**
 * Ordre canonique des tags pour le prompt FAL. L'ordre compte — les tokens
 * qui apparaissent EN PREMIER ont plus d'influence sur FLUX/SDXL.
 *
 * Priorité :
 *   1. style manga (MANGA_MEDIUM + VISUAL_STYLE)
 *   2. sujet dominant (HERO/SECONDARY/NPC/GROUP)
 *   3. action courante (SCENE_ACTION)
 *   4. décor (ENVIRONMENT)
 *   5. props visibles (PROP_DESCRIPTION)
 *   6. contraintes canon (tenue, blessures, inventaire)
 *   7. interdits (FORBIDDEN_ELEMENTS)
 */
const VISUAL_TAG_ORDER: PromptSection["tag"][] = [
  "MANGA_MEDIUM",
  "VISUAL_STYLE",
  "HERO_DESCRIPTION",
  "SECONDARY_CHARACTER_DESCRIPTION",
  "GROUP_DESCRIPTION",
  "NPC_DESCRIPTION",
  "SCENE_ACTION",
  "ENVIRONMENT",
  "PROP_DESCRIPTION",
  "CANON_CONSTRAINTS",
  "FORBIDDEN_ELEMENTS",
];

/**
 * Nettoie un fragment de section pour l'envoi diffusion :
 *   - supprime les préfixes narratifs type "Panel role: primary subject"
 *   - supprime les marqueurs "Mandatory", "Required", "Forbidden elements:"
 *     qui ne sont pas des tokens visuels
 *   - normalise les séparateurs (. → ,)
 */
function sanitizeFragment(fragment: string): string {
  return fragment
    .trim()
    .replace(/\n+/g, ", ")
    .replace(/\.\s+/g, ", ")
    .replace(/\.$/, "")
    .replace(/\s*;\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,/g, ",")
    .replace(/^,\s*/, "")
    .trim();
}

/**
 * Extrait le contenu d'une section en supprimant les préfixes lourds qui
 * n'aident pas la diffusion (ex: "Hero: Lyra (main_hero). <description>.
 * Panel role: primary subject." → "Hero Lyra, <description>, primary subject").
 */
function extractVisualContent(section: PromptSection): string {
  let content = section.languageEn;

  // Nettoie les annotations narratives qui n'aident pas FLUX
  content = content
    .replace(/\bPanel role:\s*/gi, "")
    .replace(/\bContent rating:.*?($|\.)/gi, "")
    .replace(/\bChapter\s+"[^"]*":\s*/gi, "")
    .replace(/\bBeat\s+"[^"]*".*?($|\.)/gi, "")
    .replace(/\blabels\s*:\s*/gi, "")
    .replace(/\baudience\s+[a-z_]+,?\s*/gi, "")
    .replace(/\bviolence\s+[a-z_]+,?\s*/gi, "")
    .replace(/\bsensuality\s+[a-z_]+,?\s*/gi, "");

  return sanitizeFragment(content);
}

/**
 * Fragment compact pour l'en-tête médium. Selon `format`, génère
 * un en-tête manga (N&B, screentone) ou webtoon (couleur, vertical scroll).
 */
function buildHeader(
  _mediumSection: PromptSection | undefined,
  styleSection: PromptSection | undefined,
  format: "manga" | "webtoon" = "manga",
): string {
  const medium = format === "webtoon"
    ? "webtoon panel, full color webtoon art, vertical scroll composition, korean manhwa style, clean digital coloring, soft cell-shading"
    : "manga panel, manga linework, screentone shading, manga composition, black and white";

  if (!styleSection) return medium;

  const raw = extractVisualContent(styleSection);
  const tail = raw
    .replace(/manga reference style:\s*/i, "")
    .replace(/webtoon reference style:\s*/i, "")
    .replace(/\bmanga\b/gi, "")
    .replace(/\bwebtoon\b/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/^,\s*/, "")
    .trim();

  return tail ? `${medium}, ${tail}` : medium;
}

/**
 * Produit le prompt FAL final à envoyer au provider.
 *
 * @param sections sections structurées issues du canonical recipe
 * @param options  réglages longueur / séparateur
 */
export function flattenSectionsForFal(
  sections: ReadonlyArray<PromptSection>,
  options: FlattenOptions = {},
): string {
  const maxLength = options.maxLength ?? 1200;
  const sep = options.separator ?? ", ";

  const byTag = new Map<PromptSection["tag"], PromptSection>();
  for (const s of sections) {
    if (NON_VISUAL_TAGS.has(s.tag)) continue;
    byTag.set(s.tag, s);
  }

  const fragments: string[] = [];

  // 1. En-tête médium (manga vs webtoon, toujours en premier)
  fragments.push(buildHeader(byTag.get("MANGA_MEDIUM"), byTag.get("VISUAL_STYLE"), options.format ?? "manga"));

  // 2. Sections visuelles dans l'ordre
  for (const tag of VISUAL_TAG_ORDER) {
    if (tag === "MANGA_MEDIUM" || tag === "VISUAL_STYLE") continue; // déjà dans l'en-tête
    const section = byTag.get(tag);
    if (!section) continue;
    const content = extractVisualContent(section);
    if (content.length > 0) fragments.push(content);
  }

  // 3. Join + troncature si dépassement
  let joined = fragments.join(sep);
  joined = joined
    .replace(/\s*,\s*,\s*/g, ", ")
    .replace(/,\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (joined.length > maxLength) {
    // Troncature propre : on coupe au dernier séparateur avant la limite
    const cut = joined.lastIndexOf(sep, maxLength);
    joined = cut > maxLength * 0.6 ? joined.slice(0, cut) : joined.slice(0, maxLength);
  }

  return joined;
}

/**
 * Variante qui reconstruit les sections depuis un
 * `finalEnglishStructuredPrompt` brut (fallback quand `sections[]` n'est pas
 * dispo directement, ex: packet reconstruit depuis DB).
 */
export function flattenStructuredPromptForFal(
  structuredPrompt: string,
  options: FlattenOptions = {},
): string {
  const sections = parseStructuredPrompt(structuredPrompt);
  return flattenSectionsForFal(sections, options);
}

const SECTION_LINE_RE = /^\[([A-Z_]+)\]\s*(.*)$/;

function parseStructuredPrompt(text: string): PromptSection[] {
  const lines = text.split(/\n+/);
  const sections: PromptSection[] = [];
  let current: PromptSection | null = null;
  for (const line of lines) {
    const match = line.match(SECTION_LINE_RE);
    if (match) {
      if (current) sections.push(current);
      current = {
        tag: match[1] as PromptSection["tag"],
        languageEn: match[2] ?? "",
        languageFr: "",
        required: false,
      };
    } else if (current) {
      current.languageEn += " " + line.trim();
    }
  }
  if (current) sections.push(current);
  return sections;
}

/**
 * Vérifie qu'un prompt FAL est bien manga-first et dense.
 * Renvoie les problèmes détectés (vide si tout va bien).
 */
export function auditFalPrompt(prompt: string): string[] {
  const issues: string[] = [];
  const lower = prompt.toLowerCase();

  if (!lower.startsWith("manga")) {
    issues.push("PROMPT_NOT_MANGA_FIRST: ne commence pas par 'manga'");
  }
  const mangaIdx = lower.indexOf("manga");
  if (mangaIdx > 50) {
    issues.push(
      `MANGA_TOKEN_TOO_LATE: le token 'manga' apparaît au char ${mangaIdx}, max 50`,
    );
  }
  if (/\[[A-Z_]+\]/.test(prompt)) {
    issues.push("TAG_MARKERS_PRESENT: des [TAG] résiduels polluent le prompt diffusion");
  }
  if (prompt.includes("\n\n")) {
    issues.push("DOUBLE_NEWLINE_PRESENT: double saut de ligne dans le prompt");
  }
  if (lower.includes("content rating:") || lower.includes("audience teen") || lower.includes("audience mature")) {
    issues.push("CLASSIFICATION_LEAKED: métadonnée de classification dans le prompt diffusion");
  }
  if (prompt.length < 60) {
    issues.push(`PROMPT_TOO_SHORT: ${prompt.length} chars (min 60)`);
  }
  if (prompt.length > 2000) {
    issues.push(`PROMPT_TOO_LONG: ${prompt.length} chars (max 2000)`);
  }

  return issues;
}
