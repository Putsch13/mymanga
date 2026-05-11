import type { ChapterCastContract } from "../../types/chapter-cast-contract";
import type { PanelBlueprintPremium } from "../../types/narrative-facts";
import type { ContractSourceHashes } from "../chapter-generation-contract";

import type { BuildChapterGenerationContractInput } from "./types";

/** Empreinte stable (djb2) pour les hashes de provenance — jamais « n/a ». */
function stableSourceFingerprint(label: string, payload: string): string {
  const stableJson = `${label}|${payload}`;
  let hash = 0;
  for (let i = 0; i < stableJson.length; i++) {
    const char = stableJson.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `src_${label}_${Math.abs(hash).toString(16)}`;
}

function dialogueStablePayloadFromBlueprints(blueprints: PanelBlueprintPremium[]): string {
  const rows = blueprints.map((bp) => ({
    id: bp.panelId,
    lines: (bp.dialogueLines ?? []).map((d) => ({
      cid: d.characterId ?? null,
      sp: d.speaker,
      t: d.text,
    })),
    bundle: bp.panelTextBundle?.dialogues
      ? (bp.panelTextBundle.dialogues as Array<{ speaker?: string; text?: string; characterId?: string }>).map(
          (d) => ({ cid: d.characterId ?? null, sp: d.speaker, t: d.text }),
        )
      : null,
    narration: bp.narrationText ?? bp.panelTextBundle?.narration ?? null,
  }));
  return JSON.stringify(rows);
}

function visualWorldStablePayload(vw: unknown): string {
  try {
    return typeof vw === "object" && vw !== null ? JSON.stringify(vw) : String(vw);
  } catch {
    return "visual_world_non_serializable";
  }
}

function castContractStablePayload(cast: ChapterCastContract): string {
  return JSON.stringify({
    chapterId: cast.chapterId,
    heroCharacterId: cast.heroCharacterId,
    secondaryHeroCharacterId: cast.secondaryHeroCharacterId ?? null,
    activeCharacterIds: [...cast.activeCharacterIds].filter(Boolean).sort(),
    supportCharacterIds: [...(cast.supportCharacterIds ?? [])].filter(Boolean).sort(),
    antagonistCharacterIds: [...(cast.antagonistCharacterIds ?? [])].filter(Boolean).sort(),
    npcGroupIds: (cast.npcGroups ?? []).map((g) => g.groupId).filter(Boolean).sort(),
  });
}

export function deriveContractSourceHashes(
  input: BuildChapterGenerationContractInput,
): ContractSourceHashes {
  const m = input.sourceHashMaterial ?? {};
  const intentRaw =
    typeof m.chapterIntentContractJson === "string" && m.chapterIntentContractJson.trim()
      ? m.chapterIntentContractJson.trim()
      : typeof m.chapterUserIntent === "string" && m.chapterUserIntent.trim()
        ? m.chapterUserIntent.trim()
        : `placeholder_intent|${input.projectId}|${input.chapterId}`;

  const outlinePayload = JSON.stringify(
    input.outlineBeats.map((b) => ({ id: b.id, summary: b.summary, ch: b.characters ?? [] })),
  );
  const planPayload = JSON.stringify(
    input.panelBlueprints.map((bp) => ({
      id: bp.panelId,
      beat: bp.beatId,
      n: bp.panelNumber ?? null,
    })),
  );
  const charPayload = JSON.stringify(
    input.characters.map((c) => ({
      id: c.id,
      face: c.faceRefUrl ?? null,
      sil: c.silhouetteRefUrl ?? null,
      lora: c.loraUrl ?? null,
      sig: c.canonSignatureText ?? null,
      locked: Boolean(c.canonLocked),
    })),
  );
  const locPayload = JSON.stringify(
    input.locations.map((l) => ({ id: l.id, name: l.name, d: l.visualDescription ?? null })),
  );

  const vwPayload =
    typeof m.persistedVisualWorldJson === "string" && m.persistedVisualWorldJson.trim()
      ? m.persistedVisualWorldJson.trim()
      : typeof m.visualWorldJson === "string" && m.visualWorldJson.trim()
        ? m.visualWorldJson.trim()
        : typeof m.visualWorldObject !== "undefined" && m.visualWorldObject !== null
          ? visualWorldStablePayload(m.visualWorldObject)
          : `visual_world_absent|${input.projectId}|${input.chapterId}`;

  const dialoguePayload =
    typeof m.dialogueContractJson === "string" && m.dialogueContractJson.trim()
      ? m.dialogueContractJson.trim()
      : dialogueStablePayloadFromBlueprints(input.panelBlueprints);

  const castPayload =
    typeof m.castContractJson === "string" && m.castContractJson.trim()
      ? m.castContractJson.trim()
      : m.castContract
        ? castContractStablePayload(m.castContract)
        : `cast_absent|${input.projectId}|${input.chapterId}`;

  return {
    userIntentHash: stableSourceFingerprint("user_intent", intentRaw),
    approvedOutlineHash: stableSourceFingerprint("approved_outline", outlinePayload),
    productionPlanHash: stableSourceFingerprint("production_plan", planPayload),
    characterCanonHash: stableSourceFingerprint("character_canon", charPayload),
    locationCanonHash: stableSourceFingerprint("location_canon", locPayload),
    visualWorldHash: stableSourceFingerprint("visual_world", vwPayload),
    dialogueContractHash: stableSourceFingerprint("dialogue_contract", dialoguePayload),
    castContractHash: stableSourceFingerprint("cast_contract", castPayload),
  };
}
