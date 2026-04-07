export type EntityKind =
  | "human"
  | "named_npc"
  | "animal"
  | "creature"
  | "monster"
  | "spirit"
  | "construct";

export type DialogueMode = "spoken" | "limited" | "mute" | "telepathic" | "sfx_only";
export type RecurrencePolicy = "disposable" | "recurring" | "story_locked";

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
        recurrencePolicy: "recurring",
        roleHint: `entité détectée via le mot-clé "${keyword.keyword}"`,
        speciesLabel: keyword.speciesLabel ?? null,
      });
    }
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
