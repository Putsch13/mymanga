/**
 * EntityBrain v2 — LLM-first entity resolution with layered fallbacks.
 *
 * Pipeline: Glossary → Ontology → Cache → LLM → Persist
 */

import OpenAI from "openai";
import type { EntityKind, DialogueMode, RecurrencePolicy } from "./entity-brain";

export interface ResolvedEntity {
  canonicalName: string;
  entityKind: EntityKind;
  speciesLabel: string | null;
  dialogueMode: DialogueMode;
  recurrencePolicy: RecurrencePolicy;
  typicalAppearance: string;
  canonicalVisualCore: string;
  confidence: number;
  source: "glossary" | "ontology" | "cache" | "llm";
}

export interface GlossaryEntry {
  term: string;
  description?: string;
  visualCore?: string;
  entityKind?: string;
}

interface ResolveEntityInput {
  name: string;
  contextText?: string | null;
  projectId: string;
  glossary?: GlossaryEntry[];
  projectBible?: string | null;
}

const NON_HUMAN_ONTOLOGY: Array<{
  pattern: RegExp;
  entityKind: EntityKind;
  dialogueMode: DialogueMode;
  speciesLabel: string;
  visualCore: string;
}> = [
  { pattern: /dragon/i, entityKind: "monster", dialogueMode: "limited", speciesLabel: "dragon", visualCore: "reptilian scales, wings, horns, serpentine body" },
  { pattern: /d[ée]mon/i, entityKind: "monster", dialogueMode: "telepathic", speciesLabel: "demon", visualCore: "dark aura, horns, glowing eyes, shadowy presence" },
  { pattern: /loup|wolf/i, entityKind: "animal", dialogueMode: "sfx_only", speciesLabel: "wolf", visualCore: "lupine form, fur, fangs, pointed ears" },
  { pattern: /chien|dog/i, entityKind: "animal", dialogueMode: "sfx_only", speciesLabel: "dog", visualCore: "canine, fur coat, loyal stance" },
  { pattern: /chat|cat|neko/i, entityKind: "animal", dialogueMode: "sfx_only", speciesLabel: "cat", visualCore: "feline, whiskers, tail, agile build" },
  { pattern: /corbeau|crow|raven/i, entityKind: "animal", dialogueMode: "sfx_only", speciesLabel: "crow", visualCore: "black feathers, sharp beak, dark silhouette" },
  { pattern: /slime/i, entityKind: "creature", dialogueMode: "mute", speciesLabel: "slime", visualCore: "amorphous, translucent, gelatinous form" },
  { pattern: /fant[oô]me|ghost|spectr/i, entityKind: "spirit", dialogueMode: "telepathic", speciesLabel: "ghost", visualCore: "ethereal, translucent, floating, spectral glow" },
  { pattern: /cyborg/i, entityKind: "construct", dialogueMode: "spoken", speciesLabel: "cyborg", visualCore: "metallic augmentations, cybernetic eye, mechanical limbs" },
  { pattern: /robot|automat/i, entityKind: "construct", dialogueMode: "spoken", speciesLabel: "robot", visualCore: "metallic body, mechanical joints, LED indicators" },
  { pattern: /golem/i, entityKind: "construct", dialogueMode: "limited", speciesLabel: "golem", visualCore: "massive stone/clay body, glowing runes, heavy silhouette" },
  { pattern: /monstre|monster/i, entityKind: "monster", dialogueMode: "limited", speciesLabel: "monster", visualCore: "monstrous form, claws, menacing presence" },
  { pattern: /cr[ée]ature|creature/i, entityKind: "creature", dialogueMode: "limited", speciesLabel: "creature", visualCore: "unusual anatomy, non-human features" },
  { pattern: /y[oō]kai|yokai/i, entityKind: "spirit", dialogueMode: "telepathic", speciesLabel: "yokai", visualCore: "japanese folklore entity, supernatural features, mask or animal traits" },
  { pattern: /shinigami/i, entityKind: "spirit", dialogueMode: "spoken", speciesLabel: "shinigami", visualCore: "death god, dark robes, skeletal or pale features, scythe" },
  { pattern: /kaiju/i, entityKind: "monster", dialogueMode: "mute", speciesLabel: "kaiju", visualCore: "colossal monster, city-scale, destructive presence, armored hide" },
  { pattern: /kitsune|renard/i, entityKind: "spirit", dialogueMode: "spoken", speciesLabel: "kitsune", visualCore: "fox spirit, multiple tails, shape-shifter, ethereal flames" },
  { pattern: /tengu/i, entityKind: "spirit", dialogueMode: "spoken", speciesLabel: "tengu", visualCore: "long nose or bird features, red face, mountain warrior garb" },
  { pattern: /oni/i, entityKind: "monster", dialogueMode: "limited", speciesLabel: "oni", visualCore: "ogre, horns, red or blue skin, tiger-skin loincloth, iron club" },
  { pattern: /serpent|snake|hebi/i, entityKind: "animal", dialogueMode: "sfx_only", speciesLabel: "serpent", visualCore: "scaled body, coiled form, forked tongue, slitted eyes" },
  { pattern: /phénix|phoenix/i, entityKind: "creature", dialogueMode: "mute", speciesLabel: "phoenix", visualCore: "fiery plumage, wings of flame, radiant rebirth aura" },
  { pattern: /f[ée]e|fairy/i, entityKind: "spirit", dialogueMode: "spoken", speciesLabel: "fairy", visualCore: "tiny, iridescent wings, glowing aura, delicate features" },
  { pattern: /elf|elfe/i, entityKind: "human", dialogueMode: "spoken", speciesLabel: "elf", visualCore: "pointed ears, elegant features, tall and slender" },
  { pattern: /nain|dwarf/i, entityKind: "human", dialogueMode: "spoken", speciesLabel: "dwarf", visualCore: "stocky build, thick beard, sturdy armor or crafting tools" },
  { pattern: /vampire/i, entityKind: "monster", dialogueMode: "spoken", speciesLabel: "vampire", visualCore: "pale skin, fangs, red eyes, aristocratic bearing, nocturnal" },
  { pattern: /zombie|mort-?vivant/i, entityKind: "monster", dialogueMode: "mute", speciesLabel: "zombie", visualCore: "decayed flesh, vacant eyes, shambling gait" },
  { pattern: /squelette|skeleton/i, entityKind: "construct", dialogueMode: "mute", speciesLabel: "skeleton", visualCore: "bare bones, empty eye sockets, rattling frame" },
  { pattern: /titan/i, entityKind: "monster", dialogueMode: "limited", speciesLabel: "titan", visualCore: "immense humanoid, towering presence, earth-shaking footsteps" },
];

function resolveFromOntology(name: string, contextText: string): ResolvedEntity | null {
  const combined = `${name} ${contextText}`.toLowerCase();
  for (const entry of NON_HUMAN_ONTOLOGY) {
    if (entry.pattern.test(combined)) {
      return {
        canonicalName: name,
        entityKind: entry.entityKind,
        speciesLabel: entry.speciesLabel,
        dialogueMode: entry.dialogueMode,
        recurrencePolicy: "recurring",
        typicalAppearance: entry.visualCore,
        canonicalVisualCore: entry.visualCore,
        confidence: 0.8,
        source: "ontology",
      };
    }
  }
  return null;
}

function resolveFromGlossary(name: string, glossary: GlossaryEntry[]): ResolvedEntity | null {
  const lower = name.toLowerCase();
  const match = glossary.find((g) => g.term.toLowerCase() === lower);
  if (!match) return null;

  const kind = (match.entityKind as EntityKind | undefined) ?? "named_npc";
  return {
    canonicalName: name,
    entityKind: kind,
    speciesLabel: null,
    dialogueMode: kind === "human" || kind === "named_npc" ? "spoken" : "limited",
    recurrencePolicy: "recurring",
    typicalAppearance: match.description ?? "",
    canonicalVisualCore: match.visualCore ?? match.description ?? "",
    confidence: 0.95,
    source: "glossary",
  };
}

// F06: In-memory cache with 30-minute TTL
const CACHE_TTL_MS = 30 * 60 * 1000;
const memoryCache = new Map<string, { entity: ResolvedEntity; expiresAt: number }>();

function cacheKey(projectId: string, name: string): string {
  return `${projectId}::${name.toLowerCase()}`;
}

function getCached(projectId: string, name: string): ResolvedEntity | null {
  const key = cacheKey(projectId, name);
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return { ...entry.entity, source: "cache" };
}

function setCache(projectId: string, name: string, entity: ResolvedEntity): void {
  memoryCache.set(cacheKey(projectId, name), {
    entity,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export function clearEntityCache(): void {
  memoryCache.clear();
}

const LLM_SYSTEM_PROMPT = `Tu es un expert en manga, anime et folklore mondial. 
Ton rôle : identifier une entité dans un contexte narratif manga.
Réponds UNIQUEMENT en JSON valide (pas de markdown).
Le JSON doit avoir exactement ces champs :
{
  "entityKind": "human"|"named_npc"|"animal"|"creature"|"monster"|"spirit"|"construct",
  "speciesLabel": string|null,
  "dialogueMode": "spoken"|"limited"|"mute"|"telepathic"|"sfx_only",
  "recurrencePolicy": "disposable"|"recurring"|"story_locked",
  "typicalAppearance": string,
  "canonicalVisualCore": string,
  "confidence": number (0-1)
}`;

async function resolveWithLLM(
  name: string,
  contextText: string,
  projectBible: string | null,
): Promise<ResolvedEntity | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const userPrompt = [
    `Terme/Entité : "${name}"`,
    contextText ? `Contexte narratif : "${contextText}"` : null,
    projectBible ? `Bible projet : "${projectBible.slice(0, 500)}"` : null,
    `Analyse ce terme et décris son apparence visuelle typique pour un manga.`,
  ].filter(Boolean).join("\n");

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: LLM_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });
    const raw = res.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      entityKind?: string;
      speciesLabel?: string | null;
      dialogueMode?: string;
      recurrencePolicy?: string;
      typicalAppearance?: string;
      canonicalVisualCore?: string;
      confidence?: number;
    };

    const validKinds = new Set(["human", "named_npc", "animal", "creature", "monster", "spirit", "construct"]);
    const validDialogue = new Set(["spoken", "limited", "mute", "telepathic", "sfx_only"]);
    const validRecurrence = new Set(["disposable", "recurring", "story_locked"]);

    return {
      canonicalName: name,
      entityKind: (validKinds.has(parsed.entityKind ?? "") ? parsed.entityKind : "named_npc") as EntityKind,
      speciesLabel: parsed.speciesLabel ?? null,
      dialogueMode: (validDialogue.has(parsed.dialogueMode ?? "") ? parsed.dialogueMode : "spoken") as DialogueMode,
      recurrencePolicy: (validRecurrence.has(parsed.recurrencePolicy ?? "") ? parsed.recurrencePolicy : "recurring") as RecurrencePolicy,
      typicalAppearance: parsed.typicalAppearance ?? "",
      canonicalVisualCore: parsed.canonicalVisualCore ?? parsed.typicalAppearance ?? "",
      confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.6,
      source: "llm",
    };
  } catch {
    return null;
  }
}

/**
 * Résout une entité via le pipeline:
 * 1. Glossaire projet
 * 2. Ontologies locales
 * 3. LLM fallback systématique
 */
export async function resolveEntity(input: ResolveEntityInput): Promise<ResolvedEntity> {
  const contextText = input.contextText ?? "";
  const isVitest =
    process.env.VITEST === "true" ||
    typeof process.env.VITEST_WORKER_ID === "string" ||
    typeof process.env.VITEST_POOL_ID === "string";
  const isTestEnv = process.env.NODE_ENV === "test" || isVitest;

  // 0. In-memory cache (TTL 30min)
  const cached = getCached(input.projectId, input.name);
  if (cached) return cached;

  // 1. Glossaire projet
  if (input.glossary && input.glossary.length > 0) {
    const fromGlossary = resolveFromGlossary(input.name, input.glossary);
    if (fromGlossary) {
      setCache(input.projectId, input.name, fromGlossary);
      return fromGlossary;
    }
  }

  // 2. Ontologies locales
  const fromOntology = resolveFromOntology(input.name, contextText);
  if (fromOntology) {
    setCache(input.projectId, input.name, fromOntology);
    return fromOntology;
  }

  // 2.5: DB cache (I02) — persist between server restarts
  if (!isTestEnv) {
    try {
      const { prisma } = await import("@manga-ai-studio/db");
      const dbCached = await prisma.entityCanonCache.findUnique({
        where: { projectId_canonicalName: { projectId: input.projectId, canonicalName: input.name } },
      });
      if (dbCached) {
        const fromDb: ResolvedEntity = {
          canonicalName: dbCached.canonicalName,
          entityKind: dbCached.entityKind as ResolvedEntity["entityKind"],
          speciesLabel: dbCached.speciesLabel ?? null,
          dialogueMode: dbCached.dialogueMode as ResolvedEntity["dialogueMode"],
          recurrencePolicy: dbCached.recurrencePolicy as ResolvedEntity["recurrencePolicy"],
          typicalAppearance: dbCached.typicalAppearance,
          canonicalVisualCore: dbCached.canonicalVisualCore,
          confidence: dbCached.confidence,
          source: "cache",
        };
        setCache(input.projectId, input.name, fromDb);
        return fromDb;
      }
    } catch { /* DB unavailable — continue to LLM */ }
  }

  // 3. LLM fallback systématique
  const fromLLM = await resolveWithLLM(input.name, contextText, input.projectBible ?? null);
  if (fromLLM) {
    setCache(input.projectId, input.name, fromLLM);
    // Persist to DB for future server restarts
    if (!isTestEnv) {
      try {
        const { prisma } = await import("@manga-ai-studio/db");
        await prisma.entityCanonCache.upsert({
          where: { projectId_canonicalName: { projectId: input.projectId, canonicalName: fromLLM.canonicalName } },
          create: {
            projectId: input.projectId,
            canonicalName: fromLLM.canonicalName,
            entityKind: fromLLM.entityKind,
            speciesLabel: fromLLM.speciesLabel,
            dialogueMode: fromLLM.dialogueMode,
            recurrencePolicy: fromLLM.recurrencePolicy,
            typicalAppearance: fromLLM.typicalAppearance,
            canonicalVisualCore: fromLLM.canonicalVisualCore,
            confidence: fromLLM.confidence,
            source: fromLLM.source,
            appearanceCount: 1,
          },
          update: {
            entityKind: fromLLM.entityKind,
            typicalAppearance: fromLLM.typicalAppearance,
            canonicalVisualCore: fromLLM.canonicalVisualCore,
            confidence: fromLLM.confidence,
            appearanceCount: { increment: 1 },
          },
        });
      } catch { /* DB write non-blocking */ }
    }
    return fromLLM;
  }

  // 4. Fallback ultime : PNJ nommé
  const fallback: ResolvedEntity = {
    canonicalName: input.name,
    entityKind: "named_npc",
    speciesLabel: null,
    dialogueMode: "spoken",
    recurrencePolicy: "recurring",
    typicalAppearance: "",
    canonicalVisualCore: "",
    confidence: 0.3,
    source: "ontology",
  };
  setCache(input.projectId, input.name, fallback);
  return fallback;
}

/**
 * Résout un batch d'entités, en parallèle pour les appels LLM.
 */
export async function resolveEntities(
  names: string[],
  baseInput: Omit<ResolveEntityInput, "name">,
): Promise<Map<string, ResolvedEntity>> {
  const results = new Map<string, ResolvedEntity>();
  const promises = names.map(async (name) => {
    const resolved = await resolveEntity({ ...baseInput, name });
    results.set(name.toLowerCase(), resolved);
  });
  await Promise.allSettled(promises);
  return results;
}
