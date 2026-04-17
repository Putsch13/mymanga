/**
 * Narrative pass — indexation des références canoniques (portraits) et LoRA par personnage.
 *
 * Extrait de narrative-pass.ts (étape 3b). Sans effet de bord : pur build de Maps.
 *
 * - `canonRefByName` : StableImageReference (portrait canonique) indexé par nom de personnage,
 *   fallback sur legacy `canonicalImageUrl` si pas de `canonicalReference` structurée.
 * - `loraByCharId` / `loraByCharName` : LoRA active + triggerWord + scale, indexée par id et
 *   par nom (collision warning pour homonymes).
 */

import type { StableImageReference } from "@manga-ai-studio/core";
import { buildStableImageReference } from "../../stable-image-refs";

export type LoraIndexEntry = { url: string; triggerWord: string; scale: number };

export interface CanonAndLoraIndex {
  canonRefByName: Map<string, StableImageReference>;
  // P1-5 : ref portrait dédiée par character (closeup visage)
  faceCloseupRefByName: Map<string, StableImageReference>;
  loraByCharId: Map<string, LoraIndexEntry>;
  loraByCharName: Map<string, LoraIndexEntry>;
}

export function buildCanonAndLoraIndex(input: {
  rawCharacters: Array<{
    id: string;
    name: string;
    canonicalImageUrl?: string | null;
    canonicalReference?: StableImageReference | null;
    faceCloseupReference?: StableImageReference | null;
  }>;
  loraAttachments: Array<{
    characterId: string | null;
    enabled: boolean;
    weight: number;
    lora: {
      name: string;
      status: string;
      weightsMeta: Record<string, unknown>;
    };
  }>;
}): CanonAndLoraIndex {
  const { rawCharacters, loraAttachments } = input;

  const canonRefByName = new Map<string, StableImageReference>();
  const faceCloseupRefByName = new Map<string, StableImageReference>();
  for (const c of rawCharacters) {
    const ref =
      c.canonicalReference
      ?? (c.canonicalImageUrl
        ? buildStableImageReference({
            publicUrl: c.canonicalImageUrl,
            sourceUrl: c.canonicalImageUrl,
            sourceType: "legacy_url",
          })
        : null);
    if (ref) canonRefByName.set(c.name, ref);
    // P1-5 : fallback doux — si pas de ref closeup dédiée, on laisse vide
    // (le pipeline bascule alors sur la canonicalReference).
    if (c.faceCloseupReference) {
      faceCloseupRefByName.set(c.name, c.faceCloseupReference);
    }
  }

  const loraByCharId = new Map<string, LoraIndexEntry>();
  for (const att of loraAttachments) {
    const meta = att.lora.weightsMeta as Record<string, unknown>;
    const loraUrl = typeof meta.loraUrl === "string" ? meta.loraUrl : null;
    const triggerWord = typeof meta.triggerWord === "string" ? meta.triggerWord : att.lora.name;
    if (loraUrl && att.characterId && att.enabled && att.lora.status === "active") {
      loraByCharId.set(att.characterId, { url: loraUrl, triggerWord, scale: att.weight });
    }
  }

  const loraByCharName = new Map<string, LoraIndexEntry>();
  for (const c of rawCharacters) {
    const lora = loraByCharId.get(c.id);
    if (lora) {
      if (loraByCharName.has(c.name)) {
        console.warn(
          `[pipeline:R06] loraByCharName collision: "${c.name}" already mapped — prefer loraByCharId for id=${c.id}`,
        );
      }
      loraByCharName.set(c.name, lora);
    }
  }

  return { canonRefByName, faceCloseupRefByName, loraByCharId, loraByCharName };
}
