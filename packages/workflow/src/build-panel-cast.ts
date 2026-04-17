import {
  type PanelCast,
  type PanelCastMember,
  type CharacterImportanceTier,
  inferCastRole,
  resolvePanelFocus,
  resolveCharacterImportanceTier,
} from "@manga-ai-studio/core";

interface PanelCastInput {
  panelCharacterNames: string[];
  rawCharacters: Array<{
    id: string;
    name: string;
    roleType?: string | null;
    recurrencePolicy?: string | null;
    canonicalImageUrl?: string | null;
  }>;
  loraByCharId?: Map<string, { triggerWord?: string }>;
  subjectFocus?: string | null;
  speakerName?: string | null;
  propCarrierNames?: string[];
  blueprintMustShowIds?: string[];
  blueprintMayShowIds?: string[];
}

export function buildPanelCast(input: PanelCastInput): PanelCast {
  const {
    panelCharacterNames,
    rawCharacters,
    loraByCharId,
    subjectFocus,
    speakerName,
    propCarrierNames = [],
    blueprintMustShowIds = [],
  } = input;

  const members: PanelCastMember[] = [];
  const seenIds = new Set<string>();

  for (const charName of panelCharacterNames) {
    const raw = rawCharacters.find((rc) => rc.name === charName);
    if (!raw || seenIds.has(raw.id)) continue;
    seenIds.add(raw.id);

    const role = inferCastRole(raw.roleType);
    const importanceTier: CharacterImportanceTier = resolveCharacterImportanceTier({
      roleType: typeof raw.roleType === "string" ? raw.roleType : null,
      recurrencePolicy: typeof raw.recurrencePolicy === "string" ? raw.recurrencePolicy : null,
    });
    const mustBeVisible = blueprintMustShowIds.includes(raw.id)
      || role === "protagonist"
      || role === "antagonist"
      || role === "deuteragonist"
      || role === "important_npc"
      || role === "recurring_npc";
    const isSpeaker = speakerName ? raw.name === speakerName : false;
    const isPropCarrier = propCarrierNames.includes(raw.name);
    const lora = loraByCharId?.get(raw.id);

    members.push({
      characterId: raw.id,
      name: raw.name,
      role,
      importanceTier,
      mustBeVisible,
      isSpeaker,
      isFocus: false,
      isPropCarrier,
      anchorRefUrl: raw.canonicalImageUrl ?? null,
      loraTrigger: lora?.triggerWord ?? null,
    });
  }

  const rawFocus = resolvePanelFocus(subjectFocus, members);
  let resolvedFocus: PanelCastMember | null = null;
  if (rawFocus) {
    resolvedFocus = { ...rawFocus, isFocus: true };
    const idx = members.findIndex((m) => m.characterId === rawFocus.characterId);
    if (idx >= 0) members[idx] = resolvedFocus;
  }

  const supporting = members.filter(
    (m) => m.characterId !== resolvedFocus?.characterId && (m.mustBeVisible || m.isSpeaker || m.isPropCarrier),
  );
  const background = members.filter(
    (m) => m.characterId !== resolvedFocus?.characterId && !supporting.some((s) => s.characterId === m.characterId),
  );

  return { focus: resolvedFocus, supporting, background };
}
