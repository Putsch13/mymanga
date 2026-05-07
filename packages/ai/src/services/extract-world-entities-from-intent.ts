/**
 * Extraction LLM d'entités "monde" depuis l'intention utilisateur d'un chapitre.
 *
 * Objectif : dès que l'utilisateur écrit son résumé / pitch / ce qui doit
 * arriver, on extrait automatiquement (par LLM, jamais regex) :
 *   - Les groupes de PNJ mentionnés ("Pêcheurs du port", "Clan des Profondeurs")
 *   - Les accessoires / artefacts narratifs ("talisman pourpre", "épée volcanique")
 *
 * Le résultat est ensuite upserté en DB (NpcGroup / WorldProp) avec une
 * stratégie USER-WINS : si l'utilisateur a déjà édité un groupe / prop, on ne
 * réécrit JAMAIS ses champs ; on incrémente juste `appearanceCount`.
 *
 * Activation : `OPENAI_API_KEY` requis. Sinon → fallback heuristique léger
 * (extraction par patterns simples) pour ne pas bloquer les environnements de
 * test, mais le résultat sera marqué `source: "heuristic_fallback"`.
 */

import OpenAI from "openai";
import { z } from "zod";

const npcGroupSchema = z.object({
  /** Nom affichable lisible — DOIT être en français, en titre court (1-4 mots). */
  label: z.string().min(2).max(80),
  /** Description narrative courte (1 phrase). */
  description: z.string().max(220).optional().nullable(),
  /** Profil visuel : couleurs, ambiance, posture collective. */
  visualProfile: z.string().max(220).optional().nullable(),
  /** Tenue / uniforme. */
  outfit: z.string().max(160).optional().nullable(),
  /** Silhouette générale, accessoires types. */
  silhouette: z.string().max(160).optional().nullable(),
});

const worldPropSchema = z.object({
  label: z.string().min(2).max(80),
  description: z.string().max(220).optional().nullable(),
  visualDescription: z.string().max(220).optional().nullable(),
  /** Catégorie. */
  kind: z
    .enum(["weapon", "artefact", "tool", "accessory", "vehicle", "other"])
    .optional()
    .default("other"),
  /** Importance narrative. */
  narrativeWeight: z
    .enum(["key", "recurring", "one_shot"])
    .optional()
    .default("recurring"),
});

const responseSchema = z.object({
  npcGroups: z.array(npcGroupSchema).max(12).default([]),
  worldProps: z.array(worldPropSchema).max(16).default([]),
});

export type ExtractedNpcGroup = z.infer<typeof npcGroupSchema>;
export type ExtractedWorldProp = z.infer<typeof worldPropSchema>;

export interface ExtractWorldEntitiesFromIntentInput {
  /** Texte combiné : pitch + mustHappen + wish + tout ce que l'utilisateur a écrit. */
  rawUserIntent: string;
  /** Optionnel : titre/synopsis du projet pour cadrer le ton. */
  projectTitle?: string | null;
  projectGenre?: string | null;
  projectTone?: string | null;
  /** Slugs des groupes PNJ déjà connus (à ne pas re-créer / à enrichir). */
  existingNpcGroupSlugs?: string[];
  /** Slugs des props déjà connus (idem). */
  existingWorldPropSlugs?: string[];
  /** Override modèle. */
  model?: string;
}

export interface ExtractWorldEntitiesFromIntentResult {
  npcGroups: ExtractedNpcGroup[];
  worldProps: ExtractedWorldProp[];
  source: "openai" | "heuristic_fallback";
  warnings: string[];
}

const FALLBACK_NPC_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /p[êe]cheurs?/gi, label: "Pêcheurs" },
  { pattern: /chasseurs?/gi, label: "Chasseurs" },
  { pattern: /gardes?/gi, label: "Gardes" },
  { pattern: /marchands?/gi, label: "Marchands" },
  { pattern: /soldats?|gardiens?/gi, label: "Soldats" },
  { pattern: /paysans?|fermiers?/gi, label: "Paysans" },
  { pattern: /bandits?|brigands?|pirates?/gi, label: "Bandits" },
  { pattern: /moines?|pr[êe]tres?/gi, label: "Moines" },
  { pattern: /enfants?/gi, label: "Enfants" },
  { pattern: /villageois|habitants?/gi, label: "Villageois" },
];

function heuristicExtract(text: string): ExtractWorldEntitiesFromIntentResult {
  const seen = new Set<string>();
  const npcGroups: ExtractedNpcGroup[] = [];
  for (const { pattern, label } of FALLBACK_NPC_PATTERNS) {
    if (pattern.test(text) && !seen.has(label)) {
      seen.add(label);
      npcGroups.push({ label, description: null, visualProfile: null, outfit: null, silhouette: null });
    }
  }
  return {
    npcGroups,
    worldProps: [],
    source: "heuristic_fallback",
    warnings: ["openai_unavailable_fallback_heuristic"],
  };
}

/**
 * Extraction principale. Utilise le LLM si possible, sinon fallback heuristique.
 */
export async function extractWorldEntitiesFromIntent(
  input: ExtractWorldEntitiesFromIntentInput,
): Promise<ExtractWorldEntitiesFromIntentResult> {
  const text = input.rawUserIntent.trim();
  const warnings: string[] = [];

  if (text.length < 8) {
    warnings.push("intent_too_short_skip_extraction");
    return { npcGroups: [], worldProps: [], source: "heuristic_fallback", warnings };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    warnings.push("openai_api_key_missing");
    const fb = heuristicExtract(text);
    return { ...fb, warnings: [...warnings, ...fb.warnings] };
  }

  const openai = new OpenAI({ apiKey });
  const model = input.model ?? process.env.OPENAI_WORLD_EXTRACTION_MODEL ?? "gpt-4o-mini";

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Tu es un assistant d'analyse narrative pour un studio manga. Ta mission : à partir de l'intention d'un chapitre (en français), extraire deux types d'entités d'univers :

1) **npcGroups** : groupes collectifs de PNJ qui apparaissent dans l'histoire.
   - Inclure : foules nommées (ex. "Clan des Profondeurs"), métiers collectifs ("Pêcheurs du port"), factions ("Garde royale").
   - Exclure : personnages nommés individuellement (ils sont gérés ailleurs).
   - Pour chaque groupe, donner un label court (français, lisible), une description narrative en 1 phrase, et un profil visuel/tenue/silhouette si l'intention en suggère.
   - Si l'utilisateur a donné un nom propre (ex. "Clan des Profondeurs"), utiliser ce nom EXACTEMENT comme label.

2) **worldProps** : accessoires / artefacts / objets narratifs significatifs.
   - Inclure : armes nommées, talismans, artefacts magiques, véhicules importants, objets pivots du chapitre.
   - Exclure : objets décoratifs banals (table, chaise…).
   - Pour chaque prop : label (nom donné par l'utilisateur si présent), description courte, description visuelle, kind ("weapon" | "artefact" | "tool" | "accessory" | "vehicle" | "other"), narrativeWeight ("key" si pivot, "recurring" sinon).

RÈGLES CRITIQUES :
- N'INVENTE PAS. Si l'utilisateur ne mentionne pas de groupe PNJ / prop, retourne un tableau vide.
- RESPECTE les noms propres exacts donnés par l'utilisateur.
- Si tu enrichis (visualProfile, outfit), reste cohérent avec ce que l'utilisateur dit, sans contredire.
- Réponds UNIQUEMENT avec ce JSON : {"npcGroups": [...], "worldProps": [...]}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            chapterIntent: text.slice(0, 4000),
            projectTitle: input.projectTitle ?? null,
            projectGenre: input.projectGenre ?? null,
            projectTone: input.projectTone ?? null,
            alreadyKnownNpcGroups: (input.existingNpcGroupSlugs ?? []).slice(0, 40),
            alreadyKnownWorldProps: (input.existingWorldPropSlugs ?? []).slice(0, 40),
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      warnings.push("openai_response_not_json");
      const fb = heuristicExtract(text);
      return { ...fb, warnings: [...warnings, ...fb.warnings] };
    }

    const validated = responseSchema.safeParse(parsed);
    if (!validated.success) {
      warnings.push(`openai_response_invalid_schema:${validated.error.issues.length}`);
      const fb = heuristicExtract(text);
      return { ...fb, warnings: [...warnings, ...fb.warnings] };
    }

    return {
      npcGroups: validated.data.npcGroups,
      worldProps: validated.data.worldProps,
      source: "openai",
      warnings,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`openai_error:${msg.slice(0, 120)}`);
    const fb = heuristicExtract(text);
    return { ...fb, warnings: [...warnings, ...fb.warnings] };
  }
}

/**
 * Slugifie un label pour clé stable. Garde l'unicité humaine et tolère
 * les caractères français (é, à, etc. → ascii).
 */
export function slugifyLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
