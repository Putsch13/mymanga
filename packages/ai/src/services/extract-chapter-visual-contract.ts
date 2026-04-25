/**
 * Extraction du contrat visuel **local au chapitre** via LLM (JSON strict),
 * avec repli sûr si pas de clé OpenAI ou parse invalide.
 */

import OpenAI from "openai";
import { z } from "zod";
import type { ChapterVisualContract } from "../contracts/chapter-visual-contract";
import type { RequiredVisualCoverage } from "./required-visual-coverage";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const importanceSchema = z.enum(["required", "optional", "ambient"]);

const locationSliceSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.7),
  sourceBeatIds: z.array(z.string()).default([]),
  importance: importanceSchema.default("optional"),
});

const characterSliceSchema = z.object({
  name: z.string(),
  role: z.enum(["main", "secondary", "npc", "unknown"]).default("unknown"),
  knownCharacterId: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
  sourceBeatIds: z.array(z.string()).default([]),
  importance: importanceSchema.default("optional"),
});

const groupSliceSchema = z.object({
  name: z.string(),
  kind: z.enum(["npc_group", "species", "crowd", "faction"]).default("npc_group"),
  description: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.6),
  sourceBeatIds: z.array(z.string()).default([]),
  importance: importanceSchema.default("optional"),
});

const creatureSliceSchema = z.object({
  name: z.string(),
  kind: z.enum(["monster", "hybrid", "robot", "animal", "spirit", "unknown"]).default("unknown"),
  description: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.7),
  sourceBeatIds: z.array(z.string()).default([]),
  importance: importanceSchema.default("optional"),
});

const propSliceSchema = z.object({
  name: z.string(),
  description: z.string().default(""),
  importance: importanceSchema.default("optional"),
  confidence: z.number().min(0).max(1).default(0.65),
  sourceBeatIds: z.array(z.string()).default([]),
});

const rejectedSliceSchema = z.object({
  name: z.string(),
  reason: z.string(),
});

function stripDiacriticsKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Normalise les rôles renvoyés par le LLM (FR / synonymes) avant `safeParse` Zod.
 */
export function normalizeCharacterRole(value: unknown): "main" | "secondary" | "npc" | "unknown" {
  const raw = stripDiacriticsKey(String(value ?? ""));
  const map: Record<string, "main" | "secondary" | "npc" | "unknown"> = {
    hero: "main",
    heros: "main",
    protagoniste: "main",
    "personnage principal": "main",
    principal: "main",
    main: "main",
    secondary: "secondary",
    secondaire: "secondary",
    support: "secondary",
    allie: "secondary",
    ally: "secondary",
    npc: "npc",
    pnj: "npc",
    figurant: "npc",
    groupe: "npc",
    ami: "npc",
    amie: "npc",
    unknown: "unknown",
    inconnu: "unknown",
    inconnue: "unknown",
    autre: "unknown",
  };
  return map[raw] ?? "unknown";
}

function normalizeGroupKind(value: unknown): "npc_group" | "species" | "crowd" | "faction" {
  const raw = stripDiacriticsKey(String(value ?? ""));
  const map: Record<string, "npc_group" | "species" | "crowd" | "faction"> = {
    npc_group: "npc_group",
    pnj: "npc_group",
    groupe: "npc_group",
    humains: "npc_group",
    humain: "npc_group",
    human: "npc_group",
    humans: "npc_group",
    personnes: "npc_group",
    people: "npc_group",
    pecheurs: "npc_group",
    pêcheurs: "npc_group",
    villagers: "npc_group",
    foule: "crowd",
    crowd: "crowd",
    passants: "crowd",
    faction: "faction",
    clan: "faction",
    guilde: "faction",
    espece: "species",
    species: "species",
    peuple: "species",
  };
  return map[raw] ?? "npc_group";
}

function normalizeCreatureKind(value: unknown): "monster" | "hybrid" | "robot" | "animal" | "spirit" | "unknown" {
  const raw = stripDiacriticsKey(String(value ?? ""));
  const map: Record<string, "monster" | "hybrid" | "robot" | "animal" | "spirit" | "unknown"> = {
    monstre: "monster",
    monster: "monster",
    creature: "monster",
    créature: "monster",
    hybride: "hybrid",
    hybrid: "hybrid",
    robot: "robot",
    mecha: "robot",
    animal: "animal",
    animaux: "animal",
    esprit: "spirit",
    spirit: "spirit",
    fantome: "spirit",
    unknown: "unknown",
    inconnu: "unknown",
  };
  return map[raw] ?? "unknown";
}

function normalizeChapterVisualContractJsonRoles(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const o = raw as Record<string, unknown>;
  return {
    ...o,
    characters: Array.isArray(o.characters)
      ? o.characters.map((c) => {
          if (!c || typeof c !== "object" || Array.isArray(c)) return c;
          const ch = c as Record<string, unknown>;
          return {
            ...ch,
            role: normalizeCharacterRole(ch.role),
          };
        })
      : o.characters,
    groups: Array.isArray(o.groups)
      ? o.groups.map((g) => {
          if (!g || typeof g !== "object" || Array.isArray(g)) return g;
          const group = g as Record<string, unknown>;
          return {
            ...group,
            kind: normalizeGroupKind(group.kind),
          };
        })
      : o.groups,
    species: Array.isArray(o.species)
      ? o.species.map((c) =>
          typeof c === "object" && c !== null && !Array.isArray(c)
            ? { ...(c as Record<string, unknown>), kind: normalizeCreatureKind((c as Record<string, unknown>).kind) }
            : c,
        )
      : o.species,
    robots: Array.isArray(o.robots)
      ? o.robots.map((c) =>
          typeof c === "object" && c !== null && !Array.isArray(c)
            ? { ...(c as Record<string, unknown>), kind: "robot" }
            : c,
        )
      : o.robots,
    hybrids: Array.isArray(o.hybrids)
      ? o.hybrids.map((c) =>
          typeof c === "object" && c !== null && !Array.isArray(c)
            ? { ...(c as Record<string, unknown>), kind: "hybrid" }
            : c,
        )
      : o.hybrids,
    creatures: Array.isArray(o.creatures)
      ? o.creatures.map((c) =>
          typeof c === "object" && c !== null && !Array.isArray(c)
            ? { ...(c as Record<string, unknown>), kind: normalizeCreatureKind((c as Record<string, unknown>).kind) }
            : c,
        )
      : o.creatures,
  };
}

const chapterVisualContractLlmSchema = z.object({
  mainLocation: locationSliceSchema.nullable().optional(),
  secondaryLocations: z.array(locationSliceSchema).default([]),
  characters: z.array(characterSliceSchema).default([]),
  groups: z.array(groupSliceSchema).default([]),
  species: z.array(creatureSliceSchema).default([]),
  robots: z.array(creatureSliceSchema).default([]),
  hybrids: z.array(creatureSliceSchema).default([]),
  creatures: z.array(creatureSliceSchema).default([]),
  props: z.array(propSliceSchema).default([]),
  ambientElements: z.array(propSliceSchema).default([]),
  rejectedOrUnrelated: z.array(rejectedSliceSchema).default([]),
  needsClarification: z.boolean().optional(),
});

export interface ExtractChapterVisualContractInput {
  chapterId: string;
  chapterTitle: string | null;
  chapterSummary: string | null;
  chapterUserIntent: string | null;
  productionOutline: {
    beats: Array<{
      beatId: string;
      summary?: string | null;
      whyThisBeatExists?: string | null;
      dramaticChange?: string | null;
      involvedCharacters?: string[] | null;
      environmentContext?: string[] | null;
    }>;
  } | null;
  knownCharacters: Array<{ id: string; name: string; roleType?: string | null }>;
  knownLocations?: Array<{ id?: string; name: string; aliases?: string[] }>;
  projectGenre?: string | null;
  projectTone?: string | null;
  storyBibleSummary?: string | null;
}

export interface ExtractChapterVisualContractResult {
  contract: ChapterVisualContract;
  usedOpenAI: boolean;
  warnings: string[];
  /** Obligations visuelles dérivées du contrat (importance required + beats valides). */
  requiredFromContract: RequiredVisualCoverage[];
}

const SYSTEM_PROMPT = `Tu es le directeur visuel d'un chapitre de manga.
Tu extrais un CONTRAT VISUEL LOCAL à partir du texte du chapitre (outline / intent).
Règles strictes :
- Chaque entité DOIT avoir au moins un sourceBeatId parmi les beatId fournis. Sinon n'inclus pas l'entité.
- N'invente pas de lieux ou props "fantasy génériques" : seulement ce qui est supporté par le texte.
- Les lieux / persos / props du canon projet listés en référence ne sont obligatoires QUE s'ils apparaissent explicitement dans le chapitre.
- importance "required" uniquement si l'élément est centrale à la compréhension visuelle du chapitre.
- needsClarification=true si le lieu principal reste ambigu après lecture.
- Répartis les non-humains visibles : espèces/peuples dans "species", androïdes/méchas dans "robots", chimères dans "hybrids", autres menaces dans "creatures".
Réponds UNIQUEMENT en JSON valide selon le schéma demandé (objet racine).`;

function normalizeBeatIds(ids: string[], valid: Set<string>): string[] {
  return ids.map((id) => id.trim()).filter((id) => valid.has(id));
}

function sanitizeContractForValidBeats(
  raw: z.infer<typeof chapterVisualContractLlmSchema>,
  validBeatIds: Set<string>,
): ChapterVisualContract {
  const filterLoc = (s: z.infer<typeof locationSliceSchema> | null | undefined) => {
    if (!s || !s.name.trim()) return null;
    const sourceBeatIds = normalizeBeatIds(s.sourceBeatIds, validBeatIds);
    if (sourceBeatIds.length === 0 && s.importance === "required") return null;
    return { ...s, sourceBeatIds };
  };

  const main = filterLoc(raw.mainLocation ?? null);

  return {
    mainLocation: main,
    secondaryLocations: (raw.secondaryLocations ?? [])
      .map((s) => filterLoc(s))
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    characters: (raw.characters ?? [])
      .map((c) => ({
        ...c,
        sourceBeatIds: normalizeBeatIds(c.sourceBeatIds, validBeatIds),
      }))
      .filter((c) => c.name.trim().length > 0 && c.sourceBeatIds.length > 0),
    groups: (raw.groups ?? [])
      .map((g) => ({
        ...g,
        sourceBeatIds: normalizeBeatIds(g.sourceBeatIds, validBeatIds),
      }))
      .filter((g) => g.name.trim().length > 0 && g.sourceBeatIds.length > 0),
    species: (raw.species ?? [])
      .map((c) => ({
        ...c,
        sourceBeatIds: normalizeBeatIds(c.sourceBeatIds, validBeatIds),
      }))
      .filter((c) => c.name.trim().length > 0 && c.sourceBeatIds.length > 0),
    robots: (raw.robots ?? [])
      .map((c) => ({
        ...c,
        sourceBeatIds: normalizeBeatIds(c.sourceBeatIds, validBeatIds),
      }))
      .filter((c) => c.name.trim().length > 0 && c.sourceBeatIds.length > 0),
    hybrids: (raw.hybrids ?? [])
      .map((c) => ({
        ...c,
        sourceBeatIds: normalizeBeatIds(c.sourceBeatIds, validBeatIds),
      }))
      .filter((c) => c.name.trim().length > 0 && c.sourceBeatIds.length > 0),
    creatures: (raw.creatures ?? [])
      .map((c) => ({
        ...c,
        sourceBeatIds: normalizeBeatIds(c.sourceBeatIds, validBeatIds),
      }))
      .filter((c) => c.name.trim().length > 0 && c.sourceBeatIds.length > 0),
    props: (raw.props ?? [])
      .map((p) => ({
        ...p,
        sourceBeatIds: normalizeBeatIds(p.sourceBeatIds, validBeatIds),
      }))
      .filter((p) => p.name.trim().length > 0 && p.sourceBeatIds.length > 0),
    ambientElements: (raw.ambientElements ?? [])
      .map((p) => ({
        ...p,
        sourceBeatIds: normalizeBeatIds(p.sourceBeatIds, validBeatIds),
      }))
      .filter((p) => p.name.trim().length > 0 && p.sourceBeatIds.length > 0),
    rejectedOrUnrelated: raw.rejectedOrUnrelated ?? [],
    needsClarification: raw.needsClarification,
  };
}

type LocationSlice = NonNullable<ChapterVisualContract["mainLocation"]>;

function emptyContract(needsClarification?: boolean): ChapterVisualContract {
  return {
    mainLocation: null,
    secondaryLocations: [],
    characters: [],
    groups: [],
    species: [],
    robots: [],
    hybrids: [],
    creatures: [],
    props: [],
    ambientElements: [],
    rejectedOrUnrelated: [],
    needsClarification,
  };
}

function buildUserPrompt(input: ExtractChapterVisualContractInput, validBeatIds: string[]): string {
  const beats = input.productionOutline?.beats ?? [];
  const beatLines = beats
    .map((b) => {
      const parts = [
        `beatId=${b.beatId}`,
        b.summary ? `summary=${b.summary}` : null,
        b.whyThisBeatExists ? `why=${b.whyThisBeatExists}` : null,
        b.dramaticChange ? `turn=${b.dramaticChange}` : null,
        b.environmentContext?.length ? `environment=${b.environmentContext.join(";")}` : null,
        b.involvedCharacters?.length ? `involved=${b.involvedCharacters.join(",")}` : null,
      ].filter(Boolean);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");

  const chars = input.knownCharacters
    .map((c) => `${c.id}:${c.name}${c.roleType ? ` (${c.roleType})` : ""}`)
    .join("\n");

  const locs = (input.knownLocations ?? [])
    .map((l) => `${l.id ?? ""} ${l.name} ${(l.aliases ?? []).join(",")}`.trim())
    .join("\n");

  return [
    `chapterId=${input.chapterId}`,
    `title=${input.chapterTitle ?? ""}`,
    `genre=${input.projectGenre ?? ""}`,
    `tone=${input.projectTone ?? ""}`,
    "",
    "=== Résumé / intent ===",
    input.chapterSummary ?? "",
    input.chapterUserIntent ?? "",
    "",
    input.storyBibleSummary ? `=== Bible (extrait) ===\n${input.storyBibleSummary}\n` : "",
    "=== Beats (sourceBeatIds UNIQUEMENT parmi ces beatId) ===",
    beatLines || "(aucun beat)",
    "",
    `=== beatId autorisés (JSON sourceBeatIds) ===\n${JSON.stringify(validBeatIds)}`,
    "",
    "=== Personnages projet (référence id → nom) ===",
    chars || "(aucun)",
    "",
    "=== Lieux projet (référence) ===",
    locs || "(aucun)",
    "",
    "Schéma JSON racine :",
    `{ "mainLocation": null | { name, description, confidence, sourceBeatIds, importance },`,
    `  "secondaryLocations": [...],`,
    `  "characters": [{ name, role, knownCharacterId?, confidence, sourceBeatIds, importance }],`,
    `  "groups": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "species": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "robots": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "hybrids": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "creatures": [{ name, kind, description, confidence, sourceBeatIds, importance }],`,
    `  "props": [{ name, description, importance, confidence, sourceBeatIds }],`,
    `  "ambientElements": [...],`,
    `  "rejectedOrUnrelated": [{ name, reason }],`,
    `  "needsClarification": boolean`,
    `}`,
  ].join("\n");
}

const MIN_CONF = 0.45;

/**
 * Convertit le contrat chapitre en obligations `RequiredVisualCoverage`
 * (uniquement importance === "required" et confiance suffisante).
 */
export function requiredVisualCoverageFromChapterVisualContract(
  contract: ChapterVisualContract,
): RequiredVisualCoverage[] {
  const out: RequiredVisualCoverage[] = [];

  const pushCreatureSlice = (cr: ChapterVisualContract["creatures"][number], forceKind?: ChapterVisualContract["creatures"][number]["kind"]) => {
    if (cr.importance !== "required" || cr.confidence < MIN_CONF) return;
    const bid = cr.sourceBeatIds[0];
    if (!bid) return;
    const entity = cr.name.toLowerCase().trim();
    const kind = forceKind ?? cr.kind;
    const isRobot = kind === "robot";
    out.push({
      entity,
      entityType: "creature",
      sourceBeatId: bid,
      requiresDedicatedPanel: true,
      acceptedRenderModes: isRobot ? ["creature_reveal", "insert_object"] : ["creature_reveal", "threat_silhouette"],
      acceptedSubjectFocuses: ["creature", "threat"],
      tokensHint: [entity, kind, ...entity.split(/[\s-]+/).filter((w) => w.length > 2)],
      fulfilledByPanelIds: [],
    });
  };

  const pushLoc = (loc: LocationSlice | null) => {
    if (!loc || loc.importance !== "required" || loc.confidence < MIN_CONF) return;
    const bid = loc.sourceBeatIds[0];
    if (!bid) return;
    const entity = loc.name.toLowerCase().trim();
    if (!entity || entity === "unknown") return;
    out.push({
      entity,
      entityType: "location",
      sourceBeatId: bid,
      requiresDedicatedPanel: false,
      acceptedRenderModes: ["establishing_environment", "silent_transition"],
      acceptedSubjectFocuses: ["environment"],
      tokensHint: [entity, ...entity.split(/\s+/).filter((w) => w.length > 2)],
      fulfilledByPanelIds: [],
    });
  };

  pushLoc(contract.mainLocation);
  for (const loc of contract.secondaryLocations) {
    pushLoc(loc);
  }

  for (const ch of contract.characters) {
    if (ch.importance !== "required" || ch.confidence < MIN_CONF) continue;
    const bid = ch.sourceBeatIds[0];
    if (!bid) continue;
    const entity = (ch.knownCharacterId ?? ch.name).toLowerCase().trim();
    if (!entity) continue;
    const hints = [entity, ch.name.toLowerCase()];
    out.push({
      entity,
      entityType: "character",
      sourceBeatId: bid,
      requiresDedicatedPanel: ch.role === "main",
      acceptedRenderModes: [
        "hero_closeup",
        "dialogue_two_shot",
        "dialogue_over_shoulder",
        "reaction_closeup",
        "npc_closeup",
        "enemy_closeup",
        "group_tension",
      ],
      acceptedSubjectFocuses: ["hero", "group", "important_npc", "enemy", "reaction"],
      tokensHint: [...new Set(hints)],
      fulfilledByPanelIds: [],
    });
  }

  for (const cr of contract.species) {
    pushCreatureSlice(cr, "animal");
  }
  for (const cr of contract.robots) {
    pushCreatureSlice(cr, "robot");
  }
  for (const cr of contract.hybrids) {
    pushCreatureSlice(cr, "hybrid");
  }
  for (const cr of contract.creatures) {
    pushCreatureSlice(cr);
  }

  for (const g of contract.groups) {
    if (g.importance !== "required" || g.confidence < MIN_CONF) continue;
    if (g.kind !== "species" && g.kind !== "crowd") continue;
    const bid = g.sourceBeatIds[0];
    if (!bid) continue;
    const entity = g.name.toLowerCase().trim();
    out.push({
      entity,
      entityType: "creature",
      sourceBeatId: bid,
      requiresDedicatedPanel: false,
      acceptedRenderModes: ["group_tension", "creature_reveal"],
      acceptedSubjectFocuses: ["group", "creature"],
      tokensHint: [entity],
      fulfilledByPanelIds: [],
    });
  }

  for (const p of [...contract.props, ...contract.ambientElements]) {
    if (p.importance !== "required" || p.confidence < MIN_CONF) continue;
    const bid = p.sourceBeatIds[0];
    if (!bid) continue;
    const entity = p.name.toLowerCase().trim();
    out.push({
      entity,
      entityType: "prop",
      sourceBeatId: bid,
      requiresDedicatedPanel: false,
      acceptedRenderModes: ["insert_object", "establishing_environment", "surveillance_reveal"],
      acceptedSubjectFocuses: ["prop", "environment"],
      tokensHint: [entity, ...entity.split(/\s+/).filter((w) => w.length > 2)],
      fulfilledByPanelIds: [],
    });
  }

  return out;
}

/**
 * Fusionne les obligations : le contrat chapitre prime sur les doublons (même type + entité normalisée).
 */
export function mergeRequiredVisualCoverageWithContract(
  contractCoverage: RequiredVisualCoverage[],
  base: RequiredVisualCoverage[],
): RequiredVisualCoverage[] {
  const key = (c: RequiredVisualCoverage) => `${c.entityType}|${c.entity.toLowerCase().trim()}`;
  const seen = new Set<string>();
  const merged: RequiredVisualCoverage[] = [];
  for (const c of contractCoverage) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(c);
  }
  for (const c of base) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(c);
  }
  return merged;
}

/**
 * Extrait un `ChapterVisualContract` via OpenAI. Sans clé API, retourne un contrat vide et aucune obligation dérivée.
 */
export async function extractChapterVisualContract(
  input: ExtractChapterVisualContractInput,
): Promise<ExtractChapterVisualContractResult> {
  const warnings: string[] = [];
  const beats = input.productionOutline?.beats ?? [];
  const validBeatIds = [...new Set(beats.map((b) => b.beatId).filter(Boolean))];

  if (!process.env.OPENAI_API_KEY) {
    warnings.push("chapter_visual_contract.openai_missing");
    return {
      contract: emptyContract(true),
      usedOpenAI: false,
      warnings,
      requiredFromContract: [],
    };
  }

  if (validBeatIds.length === 0) {
    warnings.push("chapter_visual_contract.no_beats");
    return {
      contract: emptyContract(true),
      usedOpenAI: false,
      warnings,
      requiredFromContract: [],
    };
  }

  try {
    /** @see process.env.OPENAI_CHAPTER_VISUAL_CONTRACT_MODEL — ex. `gpt-4o-mini` (défaut) ou `gpt-4o` pour plus de précision. */
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAPTER_VISUAL_CONTRACT_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input, validBeatIds) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
      max_tokens: 4096,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const json = JSON.parse(raw) as unknown;
    const normalizedJson = normalizeChapterVisualContractJsonRoles(json);
    const parsed = chapterVisualContractLlmSchema.safeParse(normalizedJson);
    if (!parsed.success) {
      warnings.push(`chapter_visual_contract.parse_failed=${parsed.error.message.slice(0, 200)}`);
      return {
        contract: emptyContract(true),
        usedOpenAI: true,
        warnings,
        requiredFromContract: [],
      };
    }

    const validSet = new Set(validBeatIds);
    const contract = sanitizeContractForValidBeats(parsed.data, validSet);
    const requiredFromContract = requiredVisualCoverageFromChapterVisualContract(contract);

    return {
      contract,
      usedOpenAI: true,
      warnings,
      requiredFromContract,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`chapter_visual_contract.error=${msg.slice(0, 240)}`);
    return {
      contract: emptyContract(true),
      usedOpenAI: false,
      warnings,
      requiredFromContract: [],
    };
  }
}
