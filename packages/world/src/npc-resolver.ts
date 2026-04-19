import { z } from "zod";
import type { OntologyEntry, ProceduralEntity, SceneBlueprintInput } from "./types";
import { NPC_ONTOLOGY } from "./npc-ontology";
import { createSeededRng } from "./seeded-rng";

export type NpcResolverResult = {
  entities: ProceduralEntity[];
  source: "local" | "ai";
  confidence: number;
};

function scoreEntry(entry: OntologyEntry, input: SceneBlueprintInput): number {
  const hayUniverse = input.style.universe.toLowerCase();
  const hayTone = input.style.tone.toLowerCase();
  const hayLocation = input.scene.location.toLowerCase();
  const haySummary = input.narrative.sceneSummary.toLowerCase();

  let score = 0;
  if (entry.universes.some((u) => hayUniverse.includes(u.toLowerCase()))) score += 4;
  if (entry.tones.some((t) => hayTone.includes(t.toLowerCase()))) score += 3;
  if (entry.tags.some((t) => hayLocation.includes(t.toLowerCase()) || haySummary.includes(t.toLowerCase()))) score += 2;

  if (entry.factions.length > 0 && input.scene.factions.some((f) => entry.factions.includes(f))) score += 3;
  if (entry.weathers.length > 0 && input.scene.weather && entry.weathers.includes(input.scene.weather)) score += 1;
  if (entry.worldStates.length > 0 && input.scene.worldState.some((ws) => entry.worldStates.includes(ws))) score += 2;

  score += Math.max(0, 6 - entry.rarity);
  return score;
}

export function resolveNpcLocally(
  input: SceneBlueprintInput,
  seed: number,
  desiredCount?: number,
): NpcResolverResult {
  const rng = createSeededRng(seed);
  const ranked = [...NPC_ONTOLOGY]
    .map((entry) => ({ entry, score: scoreEntry(entry, input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const count =
    desiredCount ??
    (input.controls.npcVariety >= 70 ? 3 : input.controls.npcVariety >= 40 ? 2 : 1);

  if (ranked.length === 0) {
    return { entities: [], source: "local", confidence: 0 };
  }

  const poolSize = Math.min(ranked.length, count + 2);
  const selected = rng.pickMany(ranked.slice(0, poolSize), Math.min(count, poolSize));

  const topScore = ranked[0]?.score ?? 0;
  const confidence = Math.min(1, topScore / 12);

  return {
    entities: selected.map(({ entry }) => ({
      id: `${entry.id}-${seed}`,
      label: entry.label,
      kind: "npc" as const,
      role: entry.role,
      visualCues: entry.visualCues,
      interactionHooks: entry.interactionHooks,
      sourceOntologyId: entry.id,
    })),
    source: "local",
    confidence,
  };
}

export type AiNpcResolver = (
  input: SceneBlueprintInput,
  localCandidates: ProceduralEntity[],
) => Promise<ProceduralEntity[]>;

export async function resolveNpcWithAI(
  input: SceneBlueprintInput,
  seed: number,
  aiResolver: AiNpcResolver,
  desiredCount?: number,
): Promise<NpcResolverResult> {
  const local = resolveNpcLocally(input, seed, desiredCount);

  if (local.confidence >= 0.7) {
    return local;
  }

  try {
    const aiEntities = await aiResolver(input, local.entities);
    return {
      entities: aiEntities.length > 0 ? aiEntities : local.entities,
      source: aiEntities.length > 0 ? "ai" : "local",
      confidence: aiEntities.length > 0 ? 0.9 : local.confidence,
    };
  } catch {
    return local;
  }
}

/**
 * P0.2 — Schéma Zod strict pour la sortie IA PNJ.
 *
 * Bornes imposées :
 *   - `label` : 1-80 caractères non vides après trim
 *   - `role`  : 1-40 caractères non vides
 *   - `visualCues` : 1-6 items, chacun 1-120 caractères
 *   - `interactionHooks` : 1-6 items, chacun 1-160 caractères
 *   - `promptFragment` : 1-200 caractères
 *   - `narrativeHook`  : 1-240 caractères
 *
 * Toute sortie qui ne respecte pas ces bornes est rejetée et déclenche un
 * fallback contrôlé basé sur `rawDescription`.
 */
export const aiGeneratedNpcSchema = z.object({
  label: z.string().trim().min(1, "label_empty").max(80, "label_too_long"),
  role: z.string().trim().min(1, "role_empty").max(40, "role_too_long"),
  visualCues: z
    .array(z.string().trim().min(1, "visualCue_empty").max(120, "visualCue_too_long"))
    .min(1, "visualCues_empty")
    .max(6, "visualCues_too_many"),
  interactionHooks: z
    .array(z.string().trim().min(1, "hook_empty").max(160, "hook_too_long"))
    .min(1, "interactionHooks_empty")
    .max(6, "interactionHooks_too_many"),
  promptFragment: z.string().trim().min(1, "promptFragment_empty").max(200, "promptFragment_too_long"),
  narrativeHook: z.string().trim().min(1, "narrativeHook_empty").max(240, "narrativeHook_too_long"),
});

export type AiGeneratedNpc = z.infer<typeof aiGeneratedNpcSchema>;

export type AiGeneratedNpcParseResult =
  | { ok: true; npc: AiGeneratedNpc }
  | {
      ok: false;
      reason:
        | "json_parse"
        | "json_not_object"
        | "schema_invalid";
      issues?: string[];
      raw?: string;
    };

/**
 * Parse + valide la sortie IA PNJ. Aucune écriture DB / propagation en aval
 * ne doit utiliser la sortie brute IA sans passer par ce helper.
 */
export function parseAiGeneratedNpc(raw: string): AiGeneratedNpcParseResult {
  const clean = typeof raw === "string" ? raw.replace(/```json|```/g, "").trim() : "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    return { ok: false, reason: "json_parse", raw: clean.slice(0, 200) };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "json_not_object", raw: clean.slice(0, 200) };
  }
  const result = aiGeneratedNpcSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: "schema_invalid",
      issues: result.error.issues.map((i) => `${i.path.join(".")}:${i.message}`),
      raw: clean.slice(0, 200),
    };
  }
  return { ok: true, npc: result.data };
}

/**
 * Fallback contrôlé quand la sortie IA est absente / invalide.
 * Construit un NPC minimal à partir de `rawDescription` SANS aucun parsing
 * permissif. Les bornes sont alignées sur `aiGeneratedNpcSchema`.
 */
export function buildControlledNpcFallback(input: {
  rawDescription: string;
  universe?: string;
  tone?: string;
}): AiGeneratedNpc {
  const cleanedDescription = (input.rawDescription ?? "").trim();
  const safeLabel = cleanedDescription.length > 0
    ? cleanedDescription.slice(0, 80)
    : "personnage inconnu";
  const safePrompt = cleanedDescription.length > 0
    ? `unknown manga character, ${cleanedDescription.slice(0, 140)}`
    : "unknown manga secondary character";
  return {
    label: safeLabel,
    role: "unknown",
    visualCues: ["silhouette générique", "vêtements neutres", "posture discrète"],
    interactionHooks: ["observe la scène en retrait", "peut intervenir brièvement si nécessaire", "n'influence pas l'issue du panel"],
    promptFragment: safePrompt.slice(0, 200),
    narrativeHook: `Personnage secondaire à clarifier : ${safeLabel}`.slice(0, 240),
  };
}

/**
 * Fallback IA pour les descriptions hors catalogue.
 * openaiChat est injecté pour éviter d'importer openai dans le package world.
 *
 * P0.2 — La sortie LLM est désormais parsée avec `parseAiGeneratedNpc` (Zod
 * strict). Toute sortie malformée déclenche un fallback contrôlé ; aucune
 * sortie brute n'est propagée en aval.
 */
export async function resolveNpcWithAiFallback(
  input: {
    rawDescription: string;
    universe: string;
    tone: string;
    sceneLocation?: string;
  },
  openaiChat: (messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>,
): Promise<AiGeneratedNpc> {
  const system = `Tu es un expert en design de personnages manga japonais.
À partir d'une description libre (parfois un seul mot comme "garde", "voleur", "médecin"),
génère un PNJ secondaire PRÉCIS et COHÉRENT avec l'univers donné.

RÈGLE ABSOLUE : si la description contient un rôle clair ("garde", "soldat", "marchand", "médecin", etc.),
le champ "label" DOIT refléter CE rôle. Ne jamais substituer un archétype générique différent.

Réponds UNIQUEMENT avec un objet JSON valide. Champs :
- label : string (FR) — le type exact de personnage décrit
- role : string (1 mot EN) — son fonction narrative
- visualCues : string[] (3 items FR) — détails visuels distinctifs et cohérents avec le rôle
- interactionHooks : string[] (3 items FR) — façons dont ce personnage peut interagir dans la scène
- promptFragment : string (EN, max 15 mots) — description pour prompt image
- narrativeHook : string (FR, 1 phrase) — comment il s'intègre dans la scène`;

  const user = `Description : "${input.rawDescription}"
Univers : ${input.universe}
Ton : ${input.tone}
${input.sceneLocation ? `Lieu de la scène : ${input.sceneLocation}` : ""}

Génère le JSON du PNJ.`;

  let raw: string;
  try {
    raw = await openaiChat([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
  } catch (err) {
    console.warn("[npc-resolver] llm_call_failed — controlled fallback", { err: String(err) });
    return buildControlledNpcFallback(input);
  }

  const parsed = parseAiGeneratedNpc(raw);
  if (parsed.ok) {
    return parsed.npc;
  }
  console.warn(
    `[npc-resolver] ai_output_rejected reason=${parsed.reason} issues=${(parsed.issues ?? []).join("|") || "-"} — controlled fallback`,
  );
  return buildControlledNpcFallback(input);
}
