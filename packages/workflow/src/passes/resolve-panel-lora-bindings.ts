/**
 * resolve-panel-lora-bindings.ts
 *
 * P0 — Résout les LoRA bindings pour un panel depuis la visual memory.
 *
 * Règles de priorité:
 *   1. personnage focus / héros
 *   2. personnage speaker (dialogue)
 *   3. personnage interaction principale
 *   4. personnage secondaire
 *
 * Limite par défaut: MAX_PANEL_LORAS = 2 pour éviter de surcharger FAL.
 */

import type { PanelRenderLoraBinding } from "@manga-ai-studio/ai";

const MAX_PANEL_LORAS = 2;

export interface LoraInfo {
  url: string;
  triggerWord: string;
  scale: number;
}

export interface ResolvePanelLoraBindingsInput {
  panelId: string;
  visibleCharacters: Array<{
    characterId: string;
    name: string;
    role?: string;
  }>;
  loraByCharacterId: Map<string, LoraInfo>;
  speakerCharacterIds?: string[];
  focusCharacterId?: string | null;
  maxLorasPerPanel?: number;
}

export interface ResolvePanelLoraBindingsResult {
  loraBindings: PanelRenderLoraBinding[];
  skippedCharacters: string[];
  warnings: string[];
}

function getCharacterPriority(
  char: { characterId: string; role?: string },
  focusCharacterId: string | null | undefined,
  speakerCharacterIds: string[]
): number {
  if (char.characterId === focusCharacterId) return 0;

  const role = char.role?.toLowerCase() ?? "";
  if (role === "hero") return 1;

  if (speakerCharacterIds.includes(char.characterId)) return 2;

  if (role === "support") return 3;
  if (role === "antagonist" || role === "enemy") return 4;

  return 5;
}

export function resolvePanelLoraBindings(
  input: ResolvePanelLoraBindingsInput
): ResolvePanelLoraBindingsResult {
  const {
    visibleCharacters,
    loraByCharacterId,
    speakerCharacterIds = [],
    focusCharacterId,
    maxLorasPerPanel = MAX_PANEL_LORAS,
  } = input;

  const warnings: string[] = [];
  const skippedCharacters: string[] = [];

  const charactersWithLora = visibleCharacters
    .filter(c => loraByCharacterId.has(c.characterId))
    .sort((a, b) => {
      const priorityA = getCharacterPriority(a, focusCharacterId, speakerCharacterIds);
      const priorityB = getCharacterPriority(b, focusCharacterId, speakerCharacterIds);
      return priorityA - priorityB;
    });

  const selectedCharacters = charactersWithLora.slice(0, maxLorasPerPanel);
  const skipped = charactersWithLora.slice(maxLorasPerPanel);

  if (skipped.length > 0) {
    skippedCharacters.push(...skipped.map(c => c.characterId));
    warnings.push(
      `lora_limit_reached:${input.panelId}:skipped=${skipped.map(c => c.name).join(",")}`
    );
  }

  const loraBindings: PanelRenderLoraBinding[] = selectedCharacters.map(char => {
    const lora = loraByCharacterId.get(char.characterId)!;
    return {
      characterId: char.characterId,
      characterName: char.name,
      url: lora.url,
      triggerWord: lora.triggerWord,
      scale: lora.scale,
      source: "character_lora" as const,
    };
  });

  return {
    loraBindings,
    skippedCharacters,
    warnings,
  };
}

export function buildLoraByCharacterIdMap(
  characters: Array<{
    characterId: string;
    loraUrl?: string | null;
    loraTriggerWord?: string | null;
    loraScale?: number;
  }>
): Map<string, LoraInfo> {
  const map = new Map<string, LoraInfo>();

  for (const char of characters) {
    if (char.loraUrl && char.loraTriggerWord) {
      map.set(char.characterId, {
        url: char.loraUrl,
        triggerWord: char.loraTriggerWord,
        scale: char.loraScale ?? 1.0,
      });
    }
  }

  return map;
}

export function injectLoraTriggerWords(prompt: string, loraBindings: PanelRenderLoraBinding[]): string {
  if (loraBindings.length === 0) return prompt;

  const triggerWords = loraBindings.map(l => l.triggerWord).join(", ");
  return `${triggerWords}, ${prompt}`;
}
