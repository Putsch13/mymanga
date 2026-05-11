/**
 * resolveDialogueSpeakerId
 *
 * FIX-29 (MOD) — Helper centralisé pour résoudre un libellé textuel de
 * speaker (tel qu'un panel ou un dialogue act peut le contenir : "Lux",
 * "les pêcheurs", "garde royal") vers un identifiant stable :
 *   - characterId si le label correspond à un personnage canon
 *   - npcGroupId si le label cite un groupe PNJ (par mots-clés)
 *
 * Avant ce TODO la résolution était dupliquée dans plusieurs services,
 * avec des normalisations subtilement différentes (lowercase / sans
 * accents / startsWith vs includes), ce qui faisait rater des matches
 * lors du QA dialogue (un panel disait "Lux" alors que le contrat
 * cherchait `character_lux`). On unifie.
 */

function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface DialogueSpeakerCharacterRef {
  id: string;
  name: string;
  /** Optionnel : alias parlés ("Le Loup", "Lux le marin"). */
  aliases?: ReadonlyArray<string>;
}

export interface DialogueSpeakerNpcGroupRef {
  id: string;
  /** Mots-clés uniques attendus dans le label texte (ex. ["pêcheur"]). */
  keywords: ReadonlyArray<string>;
  /** Optionnel : label visible (sert de fallback de matching). */
  label?: string | null;
}

export interface ResolveDialogueSpeakerIdInput {
  label: string | null | undefined;
  characters: ReadonlyArray<DialogueSpeakerCharacterRef>;
  npcGroups: ReadonlyArray<DialogueSpeakerNpcGroupRef>;
}

export interface ResolveDialogueSpeakerIdResult {
  speakerId: string | null;
  speakerType: "character" | "npc_group" | null;
  /** Diagnostic : sur quoi le match a été fait. */
  matchedOn: "exact_name" | "alias" | "name_substring" | "npc_keyword" | "npc_label" | null;
}

export function resolveDialogueSpeakerId(
  input: ResolveDialogueSpeakerIdInput,
): ResolveDialogueSpeakerIdResult {
  const raw = input.label ?? "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { speakerId: null, speakerType: null, matchedOn: null };
  }
  const normalized = normalizeLabel(trimmed);

  // 1. Match exact sur le nom canon d'un personnage.
  for (const c of input.characters) {
    if (normalizeLabel(c.name) === normalized) {
      return { speakerId: c.id, speakerType: "character", matchedOn: "exact_name" };
    }
  }

  // 2. Match sur un alias déclaré.
  for (const c of input.characters) {
    for (const alias of c.aliases ?? []) {
      if (normalizeLabel(alias) === normalized) {
        return { speakerId: c.id, speakerType: "character", matchedOn: "alias" };
      }
    }
  }

  // 3. Match keyword PNJ (un seul mot-clé suffit).
  for (const g of input.npcGroups) {
    for (const keyword of g.keywords) {
      const kw = normalizeLabel(keyword);
      if (kw.length === 0) continue;
      if (normalized.includes(kw)) {
        return { speakerId: g.id, speakerType: "npc_group", matchedOn: "npc_keyword" };
      }
    }
  }

  // 4. Label PNJ (fallback : "Pêcheurs" → npc_group avec label="Pêcheurs").
  for (const g of input.npcGroups) {
    const lbl = g.label ? normalizeLabel(g.label) : "";
    if (lbl.length > 0 && (normalized === lbl || normalized.includes(lbl))) {
      return { speakerId: g.id, speakerType: "npc_group", matchedOn: "npc_label" };
    }
  }

  // 5. Substring lâche sur le nom du personnage (dernier recours).
  for (const c of input.characters) {
    const cName = normalizeLabel(c.name);
    if (cName.length >= 3 && normalized.includes(cName)) {
      return { speakerId: c.id, speakerType: "character", matchedOn: "name_substring" };
    }
  }

  return { speakerId: null, speakerType: null, matchedOn: null };
}
