/**
 * IntentNarrativeContract — structured decomposition of the user's story intent
 * into verifiable constraints that downstream pipeline stages must satisfy.
 *
 * Unlike `ChapterIntentContract` (editorial level: tone, pacing, pitch),
 * this contract captures *what must happen in the story* so that QA can
 * compute a coverage score and block if the outline/dialogue diverges.
 */

import { z } from "zod";
import { zodLlmEnum } from "../utils/zod-llm";

export const requiredEventSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: zodLlmEnum(["action", "dialogue", "environment", "decision", "cutaway"]),
  actors: z.array(z.string()).default([]),
  locationHint: z.string().optional().nullable(),
  requiredDialogue: z.boolean().default(false),
  mustAppearInBeat: z.boolean().default(true),
});

export type RequiredEvent = z.infer<typeof requiredEventSchema>;

export const npcGroupRequirementSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: z.string().min(1),
  requiredDialogue: z.boolean().default(false),
  mustMention: z.array(z.string()).default([]),
  /**
   * ARCH-4 — VisualWorld NPC group id when a match was found at build time.
   * Lets downstream stages cross-reference this requirement with the
   * VisualWorldContract.npcGroups[*] without relying on label heuristics.
   */
  vwNpcGroupId: z.string().optional(),
});

export type NpcGroupRequirement = z.infer<typeof npcGroupRequirementSchema>;

export const intentNarrativeContractSchema = z.object({
  version: z.literal(1).default(1),
  chapterId: z.string().min(1),
  storyFacts: z.array(z.string()).default([]),
  requiredCharacters: z.array(z.string()).default([]),
  requiredNpcGroups: z.array(npcGroupRequirementSchema).default([]),
  requiredLocations: z.array(z.string()).default([]),
  /**
   * ARCH-4 — IDs of VisualWorld locations matched in the user intent.
   * Populated only when the builder receives `visualWorldLocations` and a
   * substring match is found; allows the QA / launch pipeline to verify that
   * the production plan visits the exact VW locations the user mentioned.
   */
  requiredLocationIds: z.array(z.string()).default([]),
  requiredEvents: z.array(requiredEventSchema).default([]),
  forbiddenInventions: z.array(z.string()).default([]),
});

export type IntentNarrativeContract = z.infer<typeof intentNarrativeContractSchema>;

export function parseIntentNarrativeContract(input: unknown): IntentNarrativeContract {
  return intentNarrativeContractSchema.parse(input);
}

// ---------------------------------------------------------------------------
// Builder: derives IntentNarrativeContract from user intent + known entities
// ---------------------------------------------------------------------------

/**
 * Known character entry (FIX-12) — unified replacement for the legacy
 * `knownCharacterIds + knownCharacterNames` parallel arrays which were prone
 * to index desync. Optional `roleType` is used by the pronoun resolver to
 * map "lui"/"elle"/"son frère"… to actual project characters.
 */
export type KnownCharacterRef = {
  id: string;
  name: string;
  roleType?: string | null;
};

export type BuildIntentNarrativeInput = {
  chapterId: string;
  userIntent: string;
  /** Unified character list. See `KnownCharacterRef` for details. */
  knownCharacters?: ReadonlyArray<KnownCharacterRef>;
  /** @deprecated use `knownCharacters` instead. Kept for transitional callers. */
  knownCharacterIds?: string[];
  /** @deprecated use `knownCharacters` instead. Kept for transitional callers. */
  knownCharacterNames?: string[];
  knownLocationNames?: string[];
  knownNpcGroupLabels?: string[];
  /** Scopes pronoun resolution to selected characters only. */
  selectedCharacterIds?: ReadonlyArray<string>;
  /**
   * ARCH-4 — VisualWorld entities (id + name) to anchor `requiredLocations`
   * and `requiredNpcGroups` to *real* IDs that exist in the VisualWorldContract.
   *
   * When provided:
   *  - `requiredLocations[i]` becomes the VisualWorld location id (resp. label)
   *    when a match is found in the user intent, allowing downstream QA to
   *    cross-reference plan beats with VW locations.
   *  - `requiredNpcGroups[i].id` becomes the VisualWorld NPC group id when a
   *    match is found, instead of a synthetic `npc_group_<keyword>` id.
   */
  visualWorldLocations?: ReadonlyArray<{ id: string; canonicalName?: string | null; name?: string | null }>;
  visualWorldNpcGroups?: ReadonlyArray<{ id: string; label?: string | null; role?: string | null }>;
};

/**
 * FIX-12 — Mapping pronoun → role hints used to resolve "lui"/"elle"…
 * to a project character. The matcher checks `roleType` substring against
 * any of the listed hints. Order matters: most specific entries first.
 */
const PRONOUN_TO_ROLE_HINTS_FR: ReadonlyArray<{
  pattern: RegExp;
  hints: string[];
}> = [
  { pattern: /\bson fr[èe]re\b/i, hints: ["brother", "sibling"] },
  { pattern: /\bsa s[œoe]ur\b/i, hints: ["sister", "sibling"] },
  { pattern: /\bson p[èe]re\b/i, hints: ["father", "parent"] },
  { pattern: /\bsa m[èe]re\b/i, hints: ["mother", "parent"] },
  { pattern: /\bson ami\b/i, hints: ["friend", "ally", "companion"] },
  { pattern: /\bson amie\b/i, hints: ["friend", "ally", "companion"] },
  { pattern: /\bson compagnon\b/i, hints: ["companion", "ally", "secondary_hero", "hero2"] },
  { pattern: /\bsa compagne\b/i, hints: ["companion", "ally", "secondary_hero", "hero2"] },
  { pattern: /\bl'autre\b/i, hints: ["secondary_hero", "secondary", "hero2"] },
  { pattern: /\blui\b/i, hints: ["secondary_hero", "hero2", "deuteragonist", "male"] },
  { pattern: /\belle\b/i, hints: ["secondary_hero", "hero2", "deuteragonist", "female"] },
];

function resolvePronouns(
  intent: string,
  knownCharacters: ReadonlyArray<KnownCharacterRef>,
  selectedCharacterIds: ReadonlyArray<string>,
  alreadyResolvedIds: ReadonlyArray<string>,
): string[] {
  if (knownCharacters.length === 0) return [];
  const resolved: string[] = [];
  const selectedSet = new Set(selectedCharacterIds);
  const skipSet = new Set(alreadyResolvedIds);

  for (const { pattern, hints } of PRONOUN_TO_ROLE_HINTS_FR) {
    if (!pattern.test(intent)) continue;
    const candidate = knownCharacters.find((char) => {
      if (skipSet.has(char.id) || resolved.includes(char.id)) return false;
      if (selectedSet.size > 0 && !selectedSet.has(char.id)) return false;
      const role = char.roleType?.toLowerCase() ?? "";
      return hints.some((hint) => role.includes(hint.toLowerCase()));
    });
    if (candidate) resolved.push(candidate.id);
  }
  return resolved;
}

/**
 * Rule-based builder (no LLM) — extracts events, actors, locations and NPC
 * groups from the free-text user intent by simple keyword / sentence analysis.
 *
 * This is intentionally conservative: the LLM-based `compileIntentNarrative`
 * (called from the `/intent-compile` route) should be preferred for premium
 * chapters; this builder is a safe synchronous fallback.
 */
export function buildIntentNarrativeContract(
  input: BuildIntentNarrativeInput,
): IntentNarrativeContract {
  const { chapterId, userIntent } = input;
  const lowerIntent = userIntent.toLowerCase();

  const knownCharacters: KnownCharacterRef[] = (() => {
    if (input.knownCharacters && input.knownCharacters.length > 0) {
      return [...input.knownCharacters];
    }
    if (
      input.knownCharacterIds
      && input.knownCharacterNames
      && input.knownCharacterIds.length === input.knownCharacterNames.length
    ) {
      return input.knownCharacterIds.map((id, idx) => ({
        id,
        name: input.knownCharacterNames?.[idx] ?? id,
      }));
    }
    return [];
  })();

  const directlyMentioned = knownCharacters
    .filter((char) => lowerIntent.includes(char.name.toLowerCase()))
    .map((char) => char.id);

  // FIX-12 — Pronoun resolution ("lui" → Kai via roleType heuristics).
  const resolvedFromPronouns = resolvePronouns(
    userIntent,
    knownCharacters,
    input.selectedCharacterIds ?? [],
    directlyMentioned,
  );

  const requiredCharacters = [...new Set([...directlyMentioned, ...resolvedFromPronouns])];

  const requiredLocations = (input.knownLocationNames ?? []).filter((name) =>
    lowerIntent.includes(name.toLowerCase()),
  );

  // ARCH-4 — VisualWorld lookup tables (location & NPC by lower-cased name).
  // We use these to (a) elect the *canonical id* for required entities,
  // (b) resolve `locationHint` on each requiredEvent.
  const vwLocationByName = new Map<string, { id: string; name: string }>();
  for (const loc of input.visualWorldLocations ?? []) {
    const candidates = [loc.canonicalName, loc.name].filter((n): n is string => Boolean(n));
    for (const candidate of candidates) {
      vwLocationByName.set(candidate.toLowerCase(), { id: loc.id, name: candidate });
    }
  }
  const vwNpcByLabel = new Map<string, { id: string; label: string; role: string }>();
  for (const npc of input.visualWorldNpcGroups ?? []) {
    if (!npc.label) continue;
    vwNpcByLabel.set(npc.label.toLowerCase(), {
      id: npc.id,
      label: npc.label,
      role: npc.role ?? "population",
    });
  }
  function fuzzyVwNpcMatch(label: string): { id: string; label: string; role: string } | null {
    const target = label.toLowerCase();
    const exact = vwNpcByLabel.get(target);
    if (exact) return exact;
    // Fuzzy : `Pêcheurs` ↔ `Groupe de pêcheurs` ↔ `Pêcheurs du port`.
    for (const [vwLabel, entry] of vwNpcByLabel.entries()) {
      if (vwLabel.includes(target) || target.includes(vwLabel)) return entry;
    }
    return null;
  }

  // FIX-15 (MOD) — Splitter aussi sur les conjonctions narratives
  // ("puis", "ensuite", "mais", "alors", "quand", "tandis que"…) :
  // sans ça une phrase complexe genre "Lux entre dans le temple puis
  // récupère l'artefact mais une voix le met en garde" devenait UN seul
  // requiredEvent au lieu de trois → couverture intent-coverage faussée.
  const sentenceAndClauseSplitter =
    /[.!?;\n]+|(?:\s+(?:puis|ensuite|mais|alors|quand|pendant que|avant que|après que|jusqu'à ce que|tandis que|cependant|toutefois|néanmoins)\s+)/gi;
  const sentences = userIntent
    .split(sentenceAndClauseSplitter)
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length > 5);

  function resolveLocationHintForSentence(sentence: string): string | null {
    const lower = sentence.toLowerCase();
    for (const [name, entry] of vwLocationByName.entries()) {
      if (lower.includes(name)) return entry.id;
    }
    return null;
  }

  const events: RequiredEvent[] = sentences.map((s, i) => {
    const hasDialogueHint = /\b(dit|parle|crie|murmure|explique|avoue|demande|prévient|avertit|confie|révèle)\b/i.test(s);
    const type = hasDialogueHint ? "dialogue" as const : "action" as const;
    return {
      id: `evt_${i + 1}`,
      label: s.slice(0, 120),
      type,
      actors: [],
      locationHint: resolveLocationHintForSentence(s),
      requiredDialogue: hasDialogueHint,
      mustAppearInBeat: true,
    };
  });

  const storyFacts = sentences.slice(0, 8);

  // P1-2 — Extraction des lieux depuis prépositions spatiales
  const locationPatterns = /\b(?:à|au|aux|sur|dans|en|vers|devant|derrière|près d[eu']|autour d[eu'])\s+(?:l[ea]s?\s+|un[e]?\s+)?([A-ZÀ-Ý][a-zà-ÿA-ZÀ-Ý'\s-]{2,40})/g;
  const extractedLocations = new Set(requiredLocations);
  let locMatch: RegExpExecArray | null;
  while ((locMatch = locationPatterns.exec(userIntent)) !== null) {
    const candidate = locMatch[1]?.trim();
    if (candidate && candidate.length > 2) {
      extractedLocations.add(candidate);
    }
  }

  // P1-2 — Extraction des NPC groups (mots-clés pluriels)
  const GROUP_KEYWORDS: Array<{ keyword: string; label: string; role: string }> = [
    { keyword: "pêcheurs", label: "Groupe de pêcheurs", role: "population" },
    { keyword: "marins", label: "Groupe de marins", role: "population" },
    { keyword: "pirates", label: "Groupe de pirates", role: "menace" },
    { keyword: "gardes", label: "Gardes", role: "autorité" },
    { keyword: "soldats", label: "Soldats", role: "autorité" },
    { keyword: "policiers", label: "Policiers", role: "autorité" },
    { keyword: "chevaliers", label: "Chevaliers", role: "autorité" },
    { keyword: "marchands", label: "Marchands", role: "population" },
    { keyword: "villageois", label: "Villageois", role: "population" },
    { keyword: "passants", label: "Passants", role: "population" },
    { keyword: "habitants", label: "Habitants", role: "population" },
    { keyword: "paysans", label: "Paysans", role: "population" },
    { keyword: "médecins", label: "Médecins", role: "soin" },
    { keyword: "soigneurs", label: "Soigneurs", role: "soin" },
    { keyword: "bandits", label: "Bandits", role: "menace" },
    { keyword: "ennemis", label: "Ennemis", role: "menace" },
    { keyword: "mercenaires", label: "Mercenaires", role: "menace" },
    { keyword: "voleurs", label: "Voleurs", role: "menace" },
    { keyword: "moines", label: "Moines", role: "spirituel" },
    { keyword: "prêtres", label: "Prêtres", role: "spirituel" },
    { keyword: "étudiants", label: "Étudiants", role: "population" },
    { keyword: "apprentis", label: "Apprentis", role: "population" },
  ];
  const dialogueVerbsRe = /\b(prévient|met en garde|alerte|crie|explique|avertit|menace|informe|annonce|raconte|révèle)\b/i;
  const hasDialogueVerb = dialogueVerbsRe.test(userIntent);
  const requiredNpcGroups: NpcGroupRequirement[] = [];

  // ARCH-4 — Pour chaque groupe extrait par keyword, on essaie de trouver
  // un match dans le VisualWorld (par label ou alias). Le `id` reste celui
  // du builder (synthétique ou label) afin que les contrats existants ne
  // changent pas, mais on stocke la correspondance VW dans `vwNpcGroupId`.
  function adoptVwOrSynthetic(
    syntheticId: string,
    label: string,
    role: string,
  ): NpcGroupRequirement {
    const vwMatch = fuzzyVwNpcMatch(label);
    return {
      id: syntheticId,
      label: vwMatch?.label ?? label,
      role: vwMatch?.role ?? role,
      requiredDialogue: hasDialogueVerb,
      mustMention: [],
      vwNpcGroupId: vwMatch?.id,
    };
  }

  for (const g of GROUP_KEYWORDS) {
    if (!lowerIntent.includes(g.keyword)) continue;
    requiredNpcGroups.push(adoptVwOrSynthetic(`npc_group_${g.keyword}`, g.label, g.role));
  }
  // Also include known NPC group labels (passed by caller).
  for (const label of input.knownNpcGroupLabels ?? []) {
    if (lowerIntent.includes(label.toLowerCase())) {
      const alreadyAdded = requiredNpcGroups.some((g) => g.label.toLowerCase() === label.toLowerCase());
      if (!alreadyAdded) {
        requiredNpcGroups.push(
          adoptVwOrSynthetic(
            `npc_group_known_${label.toLowerCase().replace(/\s+/g, "_")}`,
            label,
            "population",
          ),
        );
      }
    }
  }

  // ARCH-4 — `requiredLocationIds` est rempli en parallèle de `requiredLocations`
  // (qui reste en noms libres pour la rétro-compat avec `runIntentCoverageQa`).
  const requiredLocationIds: string[] = [];
  for (const name of extractedLocations) {
    const vwHit = vwLocationByName.get(name.toLowerCase());
    if (vwHit && !requiredLocationIds.includes(vwHit.id)) {
      requiredLocationIds.push(vwHit.id);
    }
  }

  return {
    version: 1,
    chapterId,
    storyFacts,
    requiredCharacters,
    requiredNpcGroups,
    requiredLocations: [...extractedLocations],
    requiredLocationIds,
    requiredEvents: events,
    forbiddenInventions: [],
  };
}
