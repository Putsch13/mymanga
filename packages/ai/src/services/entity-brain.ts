export type EntityKind =
  | "human"
  | "named_npc"
  | "npc_group"
  | "animal"
  | "creature"
  | "monster"
  | "spirit"
  | "construct";

export type DialogueMode = "spoken" | "limited" | "mute" | "telepathic" | "sfx_only";
export type RecurrencePolicy = "disposable" | "recurring" | "story_locked" | "background";

export interface IntentEntityHint {
  name: string;
  entityKind: EntityKind;
  dialogueMode: DialogueMode;
  recurrencePolicy: RecurrencePolicy;
  roleHint?: string | null;
  speciesLabel?: string | null;
}

const NON_HUMAN_KEYWORDS: Array<{
  keyword: string;
  entityKind: EntityKind;
  dialogueMode: DialogueMode;
  speciesLabel?: string;
}> = [
  { keyword: "dragon", entityKind: "monster", dialogueMode: "limited", speciesLabel: "dragon" },
  { keyword: "démon", entityKind: "monster", dialogueMode: "telepathic", speciesLabel: "demon" },
  { keyword: "demon", entityKind: "monster", dialogueMode: "telepathic", speciesLabel: "demon" },
  { keyword: "loup", entityKind: "animal", dialogueMode: "sfx_only", speciesLabel: "wolf" },
  { keyword: "chien", entityKind: "animal", dialogueMode: "sfx_only", speciesLabel: "dog" },
  { keyword: "chat", entityKind: "animal", dialogueMode: "sfx_only", speciesLabel: "cat" },
  { keyword: "corbeau", entityKind: "animal", dialogueMode: "sfx_only", speciesLabel: "crow" },
  { keyword: "slime", entityKind: "creature", dialogueMode: "mute", speciesLabel: "slime creature" },
  { keyword: "fantôme", entityKind: "spirit", dialogueMode: "telepathic", speciesLabel: "ghost" },
  { keyword: "fantome", entityKind: "spirit", dialogueMode: "telepathic", speciesLabel: "ghost" },
  { keyword: "spectre", entityKind: "spirit", dialogueMode: "telepathic", speciesLabel: "specter" },
  { keyword: "cyborg", entityKind: "construct", dialogueMode: "spoken", speciesLabel: "cyborg" },
  { keyword: "robot", entityKind: "construct", dialogueMode: "spoken", speciesLabel: "robot" },
  { keyword: "golem", entityKind: "construct", dialogueMode: "limited", speciesLabel: "golem" },
  { keyword: "monstre", entityKind: "monster", dialogueMode: "limited", speciesLabel: "monster" },
  { keyword: "créature", entityKind: "creature", dialogueMode: "limited", speciesLabel: "creature" },
  { keyword: "creature", entityKind: "creature", dialogueMode: "limited", speciesLabel: "creature" },
];

export interface GroupNpcKeyword {
  keyword: string;
  label: string;
  domain: string;
  dialogueMode: DialogueMode;
  recurrencePolicy: RecurrencePolicy;
}

const GROUP_NPC_KEYWORDS: GroupNpcKeyword[] = [
  // Maritime
  { keyword: "pêcheurs", label: "Groupe de pêcheurs", domain: "maritime", dialogueMode: "spoken", recurrencePolicy: "story_locked" },
  { keyword: "marins", label: "Groupe de marins", domain: "maritime", dialogueMode: "spoken", recurrencePolicy: "story_locked" },
  { keyword: "pirates", label: "Groupe de pirates", domain: "maritime", dialogueMode: "spoken", recurrencePolicy: "recurring" },
  // Authority
  { keyword: "gardes", label: "Garde", domain: "authority", dialogueMode: "spoken", recurrencePolicy: "recurring" },
  { keyword: "soldats", label: "Soldat", domain: "military", dialogueMode: "spoken", recurrencePolicy: "recurring" },
  { keyword: "policiers", label: "Policier", domain: "authority", dialogueMode: "spoken", recurrencePolicy: "recurring" },
  { keyword: "chevaliers", label: "Chevalier", domain: "military", dialogueMode: "spoken", recurrencePolicy: "recurring" },
  // Civilian
  { keyword: "marchands", label: "Marchand", domain: "civilian", dialogueMode: "spoken", recurrencePolicy: "disposable" },
  { keyword: "villageois", label: "Villageois", domain: "civilian", dialogueMode: "spoken", recurrencePolicy: "background" },
  { keyword: "passants", label: "Passant", domain: "civilian", dialogueMode: "spoken", recurrencePolicy: "background" },
  { keyword: "habitants", label: "Habitant", domain: "civilian", dialogueMode: "spoken", recurrencePolicy: "background" },
  { keyword: "paysans", label: "Paysan", domain: "civilian", dialogueMode: "spoken", recurrencePolicy: "background" },
  // Medical
  { keyword: "médecins", label: "Médecin", domain: "medical", dialogueMode: "spoken", recurrencePolicy: "story_locked" },
  { keyword: "soigneurs", label: "Soigneur", domain: "medical", dialogueMode: "spoken", recurrencePolicy: "story_locked" },
  // Hostile
  { keyword: "bandits", label: "Bandit", domain: "hostile", dialogueMode: "spoken", recurrencePolicy: "recurring" },
  { keyword: "ennemis", label: "Ennemi", domain: "hostile", dialogueMode: "spoken", recurrencePolicy: "recurring" },
  { keyword: "mercenaires", label: "Mercenaire", domain: "hostile", dialogueMode: "spoken", recurrencePolicy: "recurring" },
  { keyword: "voleurs", label: "Voleur", domain: "hostile", dialogueMode: "spoken", recurrencePolicy: "recurring" },
  // Spiritual / religious
  { keyword: "moines", label: "Moine", domain: "spiritual", dialogueMode: "spoken", recurrencePolicy: "story_locked" },
  { keyword: "prêtres", label: "Prêtre", domain: "spiritual", dialogueMode: "spoken", recurrencePolicy: "story_locked" },
  // Academic / guild
  { keyword: "étudiants", label: "Étudiant", domain: "academic", dialogueMode: "spoken", recurrencePolicy: "background" },
  { keyword: "apprentis", label: "Apprenti", domain: "academic", dialogueMode: "spoken", recurrencePolicy: "recurring" },
];

const WARNING_VERBS_RE = /\b(prévient|préviennent|met en garde|alerte|alertent|crie|crient|explique|expliquent|avertit|avertissent|informe|informent|annonce|annoncent|raconte|racontent|révèle|révèlent)\b/i;

export function parseIntentEntities(userIntent: string, knownNames: string[]): IntentEntityHint[] {
  const lowered = userIntent.toLowerCase();
  const known = new Set(knownNames.map((name) => name.toLowerCase()));
  const hints = new Map<string, IntentEntityHint>();

  const namePattern = /\b(?:rencontre|voit|voit enfin|croise|affronte|rejoint|avec|contre)\s+([A-ZÀ-Ý][a-zà-ÿA-ZÀ-Ý'_-]{2,24})\b/g;
  let match: RegExpExecArray | null;
  while ((match = namePattern.exec(userIntent)) !== null) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    if (known.has(candidate.toLowerCase())) continue;
    hints.set(candidate.toLowerCase(), {
      name: candidate,
      entityKind: "named_npc",
      dialogueMode: "spoken",
      recurrencePolicy: "recurring",
      roleHint: "personnage nommé dans l'intention utilisateur",
      speciesLabel: null,
    });
  }

  for (const keyword of NON_HUMAN_KEYWORDS) {
    if (!lowered.includes(keyword.keyword)) continue;
    const nearbyConfidant =
      /confie|confidence|parle|discute|question|répond|repond|guide|accompagne|imaginaire|inventé|invente/.test(lowered);
    const syntheticName =
      keyword.entityKind === "animal"
        ? keyword.keyword
        : keyword.entityKind === "monster"
          ? `Le ${keyword.keyword}`
          : `La ${keyword.keyword}`;
    if (known.has(syntheticName.toLowerCase())) continue;
    if (!hints.has(syntheticName.toLowerCase())) {
      hints.set(syntheticName.toLowerCase(), {
        name: syntheticName,
        entityKind: keyword.entityKind,
        dialogueMode: keyword.dialogueMode,
        recurrencePolicy: nearbyConfidant ? "story_locked" : "recurring",
        roleHint: nearbyConfidant
          ? `entité confidente / importante détectée via le mot-clé "${keyword.keyword}"`
          : `entité détectée via le mot-clé "${keyword.keyword}"`,
        speciesLabel: keyword.speciesLabel ?? null,
      });
    }
  }

  // Pass C — NPC groups (plural social nouns)
  for (const group of GROUP_NPC_KEYWORDS) {
    if (!lowered.includes(group.keyword)) continue;
    const key = `group:${group.keyword}`;
    if (hints.has(key)) continue;

    const hasWarningVerb = WARNING_VERBS_RE.test(userIntent);
    const requiredDialogue = hasWarningVerb;
    const policy: RecurrencePolicy = hasWarningVerb ? "story_locked" : group.recurrencePolicy;

    hints.set(key, {
      name: group.label,
      entityKind: "npc_group",
      dialogueMode: group.dialogueMode,
      recurrencePolicy: policy,
      roleHint: requiredDialogue
        ? `groupe PNJ avec dialogue requis (${group.domain})`
        : `groupe PNJ (${group.domain})`,
      speciesLabel: null,
    });
  }

  return [...hints.values()];
}

export function inferEntityProfile(input: {
  name: string;
  contextText?: string | null;
  hint?: IntentEntityHint | null;
}) {
  if (input.hint) {
    return input.hint;
  }

  const lowered = `${input.name} ${input.contextText ?? ""}`.toLowerCase();
  const match = NON_HUMAN_KEYWORDS.find((candidate) => lowered.includes(candidate.keyword));
  if (match) {
    return {
      name: input.name,
      entityKind: match.entityKind,
      dialogueMode: match.dialogueMode,
      recurrencePolicy: "recurring" as RecurrencePolicy,
      roleHint: `déduit depuis le contexte`,
      speciesLabel: match.speciesLabel ?? null,
    };
  }

  return {
    name: input.name,
    entityKind: "named_npc" as EntityKind,
    dialogueMode: "spoken" as DialogueMode,
    recurrencePolicy: "recurring" as RecurrencePolicy,
    roleHint: "pnj par défaut",
    speciesLabel: null,
  };
}
