import type { SceneExtra, SceneExtraSource } from "@manga-ai-studio/core";

import {
  LEGACY_ARCHETYPE_LABELS,
  asRecord,
  isSceneExtraSource,
} from "./utils";

/** Lit les métadonnées JSON : format courant ou ancien champ `archetype` (union). */
export function normalizeSceneExtra(raw: unknown): SceneExtra | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const sceneId = typeof o.sceneId === "string" ? o.sceneId : null;
  const anchorSlot = typeof o.anchorSlot === "string" ? o.anchorSlot : null;
  const vs = asRecord(o.visualSignature);
  const visualSignature: SceneExtra["visualSignature"] = {
    genderPresentation:
      typeof vs.genderPresentation === "string" ? vs.genderPresentation : undefined,
    hair: typeof vs.hair === "string" ? vs.hair : undefined,
    outfit: typeof vs.outfit === "string" ? vs.outfit : undefined,
    silhouette: typeof vs.silhouette === "string" ? vs.silhouette : undefined,
  };
  const reusePriority = typeof o.reusePriority === "number" ? o.reusePriority : 70;
  const canSpeak = typeof o.canSpeak === "boolean" ? o.canSpeak : false;

  if (
    id
    && sceneId
    && anchorSlot
    && typeof o.archetypeId === "string"
    && typeof o.archetypeLabel === "string"
    && isSceneExtraSource(o.source)
  ) {
    return {
      id,
      sceneId,
      archetypeId: o.archetypeId,
      archetypeLabel: o.archetypeLabel,
      source: o.source,
      visualSignature,
      anchorSlot,
      reusePriority,
      canSpeak,
    };
  }

  const legacyArch = typeof o.archetype === "string" ? o.archetype : null;
  if (id && sceneId && anchorSlot && legacyArch) {
    return {
      id,
      sceneId,
      archetypeId: `legacy:${legacyArch}`,
      archetypeLabel: LEGACY_ARCHETYPE_LABELS[legacyArch] ?? legacyArch,
      source: "legacy",
      visualSignature,
      anchorSlot,
      reusePriority,
      canSpeak,
    };
  }

  return null;
}

export function toSceneExtraList(value: unknown): SceneExtra[] {
  if (!Array.isArray(value)) return [];
  const out: SceneExtra[] = [];
  for (const item of value) {
    const n = normalizeSceneExtra(item);
    if (n) out.push(n);
  }
  return out;
}

export function dedupeExtras(extras: SceneExtra[]): SceneExtra[] {
  const seen = new Map<string, SceneExtra>();
  for (const extra of extras) {
    const key = `${extra.archetypeId}:${extra.anchorSlot}`;
    if (!seen.has(key)) seen.set(key, extra);
  }
  return [...seen.values()];
}

/** Templates déterministes pour archetypes legacy (`inferred:*`, etc.). */
function legacyVisualSignatureForArchetypeId(
  archetypeId: string,
): SceneExtra["visualSignature"] {
  const key = /(?:legacy|inferred):(.+)$/.exec(archetypeId)?.[1] ?? archetypeId;
  const templates: Record<string, SceneExtra["visualSignature"]> = {
    bartender: {
      genderPresentation: "masculine",
      outfit: "apron, shirt",
      silhouette: "stocky",
    },
    client: {
      genderPresentation: "varied",
      outfit: "casual wear",
      silhouette: "average",
    },
    guard: {
      genderPresentation: "masculine",
      outfit: "armor, uniform",
      silhouette: "muscular",
    },
    server: {
      genderPresentation: "feminine",
      outfit: "uniform, apron",
      silhouette: "slender",
    },
    merchant: {
      genderPresentation: "masculine",
      outfit: "robes, vest",
      silhouette: "rotund",
    },
    crowd: {
      genderPresentation: "varied",
      outfit: "varied",
      silhouette: "varied",
    },
  };

  return templates[key] ?? { outfit: "generic", silhouette: "average" };
}

/**
 * Signature visuelle pour un extra requis : `ai_generated` et `db_canon` (ex.
 * `VisualWorldContract` ou studio) réutilisent le libellé comme base de tenue ;
 * `legacy` garde les templates par slug.
 */
export function buildSceneExtraVisualSignature(input: {
  archetypeId: string;
  archetypeLabel: string;
  source: SceneExtraSource;
}): SceneExtra["visualSignature"] {
  if (input.source === "ai_generated" || input.source === "db_canon") {
    const outfit = input.archetypeLabel.trim().slice(0, 160) || "secondary character";
    return { genderPresentation: "varied", outfit, silhouette: "average" };
  }
  return legacyVisualSignatureForArchetypeId(input.archetypeId);
}
