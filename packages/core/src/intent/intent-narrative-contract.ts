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
});

export type NpcGroupRequirement = z.infer<typeof npcGroupRequirementSchema>;

export const intentNarrativeContractSchema = z.object({
  version: z.literal(1).default(1),
  chapterId: z.string().min(1),
  storyFacts: z.array(z.string()).default([]),
  requiredCharacters: z.array(z.string()).default([]),
  requiredNpcGroups: z.array(npcGroupRequirementSchema).default([]),
  requiredLocations: z.array(z.string()).default([]),
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

export type BuildIntentNarrativeInput = {
  chapterId: string;
  userIntent: string;
  knownCharacterIds?: string[];
  knownCharacterNames?: string[];
  knownLocationNames?: string[];
  knownNpcGroupLabels?: string[];
};

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

  const requiredCharacters = (input.knownCharacterIds ?? []).filter((id) => {
    const idx = input.knownCharacterIds?.indexOf(id) ?? -1;
    const name = input.knownCharacterNames?.[idx]?.toLowerCase();
    return name ? lowerIntent.includes(name) : false;
  });

  const requiredLocations = (input.knownLocationNames ?? []).filter((name) =>
    lowerIntent.includes(name.toLowerCase()),
  );

  const sentences = userIntent
    .split(/[.!?;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const events: RequiredEvent[] = sentences.map((s, i) => {
    const hasDialogueHint = /\b(dit|parle|crie|murmure|explique|avoue|demande|prévient|avertit|confie|révèle)\b/i.test(s);
    const type = hasDialogueHint ? "dialogue" as const : "action" as const;
    return {
      id: `evt_${i + 1}`,
      label: s.slice(0, 120),
      type,
      actors: [],
      locationHint: null,
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
  for (const g of GROUP_KEYWORDS) {
    if (!lowerIntent.includes(g.keyword)) continue;
    requiredNpcGroups.push({
      id: `npc_group_${g.keyword}`,
      label: g.label,
      role: g.role,
      requiredDialogue: hasDialogueVerb,
      mustMention: [],
    });
  }
  // Also include known NPC group labels
  for (const label of input.knownNpcGroupLabels ?? []) {
    if (lowerIntent.includes(label.toLowerCase())) {
      const alreadyAdded = requiredNpcGroups.some((g) => g.label.toLowerCase() === label.toLowerCase());
      if (!alreadyAdded) {
        requiredNpcGroups.push({
          id: `npc_group_known_${label.toLowerCase().replace(/\s+/g, "_")}`,
          label,
          role: "population",
          requiredDialogue: hasDialogueVerb,
          mustMention: [],
        });
      }
    }
  }

  return {
    version: 1,
    chapterId,
    storyFacts,
    requiredCharacters,
    requiredNpcGroups,
    requiredLocations: [...extractedLocations],
    requiredEvents: events,
    forbiddenInventions: [],
  };
}
