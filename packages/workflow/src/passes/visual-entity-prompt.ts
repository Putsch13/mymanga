/**
 * Blocs prompt génériques à partir du registre d’entités visuelles.
 */

import type { PanelBlueprintPremium } from "@manga-ai-studio/core";
import type { VisualEntity } from "./visual-entity-registry";

export function resolveBlueprintReferencePolicyForEntity(entity: VisualEntity): string {
  if (entity.referenceImageUrls.length > 0) {
    return entity.consistencyLevel === "strict" ? "STRONG" : "LIGHT";
  }
  return "CANONIZE_FROM_FIRST_APPEARANCE";
}

export function buildEntityActionLine(bp: PanelBlueprintPremium, entity: VisualEntity): string {
  const base = String(bp.purpose ?? "").trim();
  if (entity.isOpponent) {
    return `${entity.name} (${entity.userDefinedKind}) dominates the frame with immediate threat. Original cue: ${base}`;
  }
  return `${entity.name} (${entity.userDefinedKind}) performs a clear readable action. Original cue: ${base}`;
}

export function resolveRenderModeForEntity(entity: VisualEntity): string {
  if (entity.isOpponent && entity.scale === "giant") return "opponent_reveal_large_scale";
  if (entity.isOpponent && entity.canAppearAsGroup) return "opponent_group_pressure";
  if (entity.isOpponent) return "opponent_reveal";
  if (entity.isNamed) return "named_entity_focus";
  if (entity.canAppearAsGroup) return "group_entity_action";
  return "entity_action";
}

export function buildEntityPromptBlock(entity: VisualEntity): string {
  const dna = entity.visualDna;
  const groupHint = entity.canAppearAsGroup
    ? `${entity.groupCountHint ?? 3} visible members`
    : "one clearly visible individual";

  const materials = (dna.materials ?? []).join(", ");
  const colors = dna.colors.join(", ");
  const props = dna.props.join(", ");
  const symbols = dna.symbols.join(", ");
  const forbidden = dna.forbiddenDrift.join(", ");

  return `
ENTITY CANON:
Name: ${entity.name}
Kind: ${entity.userDefinedKind}
Role: ${entity.role}
Scale: ${entity.scale}
Presence: ${groupHint}

VISUAL DNA:
${entity.canonicalDescription}
Silhouette: ${dna.silhouette ?? "use canonical silhouette"}
Face: ${dna.face ?? "preserve canonical face/anatomy"}
Body/anatomy: ${dna.body ?? dna.anatomy ?? "preserve canonical anatomy"}
Outfit/armor: ${dna.outfit ?? dna.armor ?? "preserve canonical costume or surface design"}
Materials: ${materials || "(none specified)"}
Colors: ${colors || "(none specified)"}
Props: ${props || "(none specified)"}
Symbols: ${symbols || "(none specified)"}
Aura: ${dna.aura ?? "(none)"}
Movement: ${dna.movementStyle ?? "(none)"}

CANON LOCK:
Do not redesign this entity. Preserve its silhouette, proportions, anatomy, colors, symbols, equipment and material language.
Forbidden drift: ${forbidden || "(none)"}
`.trim();
}
