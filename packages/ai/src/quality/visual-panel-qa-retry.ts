/**
 * visual-panel-qa-retry.ts
 *
 * Construction du prompt de retry corrigé : patches lexicaux pilotés
 * par les `failures` réels + consigne `RetryStrategy`. Extrait de
 * `visual-panel-qa.ts` (audit-v9).
 */

import type {
  ImageRetryRecord,
  RetryContext,
  RetryStrategy,
  VisualQaFailure,
  VisualQaResult,
} from "./visual-panel-qa-types";

/**
 * AUDIT-V8 — Patches lexicaux ciblés appliqués au prompt original AVANT
 * d'ajouter la consigne de la strategy. Sans ça, le retry ré-injecte la
 * même contradiction et le QA échoue à l'identique.
 */
function applyCorrectivePatches(
  prompt: string,
  reasons: VisualQaFailure[],
): { patched: string; appliedPatches: string[] } {
  let patched = prompt;
  const applied: string[] = [];

  const reasonText = reasons
    .map((r) => `${r.category}:${r.reason}`)
    .join(" ")
    .toLowerCase();

  // 1. Doublon de personnage / "two heroes side by side"
  if (
    reasonText.includes("duplicate") ||
    reasonText.includes("two heroes") ||
    reasonText.includes("clone")
  ) {
    patched = patched.replace(/two\s+heroes/gi, "the hero with companion");
    applied.push("dedup_heroes");
  }

  // 2. Insert/cutaway dans un dialogue → drop l'insert (le contrat dit dialogue)
  if (reasonText.includes("contradictory") || reasonText.includes("insert")) {
    patched = patched
      .replace(/\binsert\s+shot\s+of\s+[^.,;]+/gi, "")
      .replace(/\bextreme close-?up on object\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    applied.push("strip_insert");
  }

  // 3. Texte halluciné → renforcer interdiction
  if (
    reasonText.includes("text") ||
    reasonText.includes("speech bubble") ||
    reasonText.includes("caption") ||
    reasonText.includes("watermark")
  ) {
    patched += " Absolutely no text, captions, speech bubbles, watermark, logo or letters anywhere in the image.";
    applied.push("hard_no_text");
  }

  // 4. Anatomie cassée → renforcer
  if (reasonText.includes("hand") || reasonText.includes("finger") || reasonText.includes("anatomy")) {
    patched += " Hands and fingers must be anatomically correct (5 fingers per hand, no extras, no fusion).";
    applied.push("anatomy_lock");
  }

  // 5. Décor vide / fond plat
  if (reasonText.includes("empty background") || reasonText.includes("flat backdrop") || reasonText.includes("decor")) {
    patched += " Background must be richly detailed and contextually consistent with the scene location.";
    applied.push("env_density");
  }

  // 6. Style drift
  if (reasonText.includes("style") || reasonText.includes("drift")) {
    patched += " Strictly preserve the chapter's manga style: linework, tones, character design.";
    applied.push("style_lock_inline");
  }

  return { patched, appliedPatches: applied };
}

export function buildRetryPrompt(
  context: RetryContext,
): {
  prompt: string;
  strengthenedRefs: boolean;
  simplifiedScene: boolean;
  /** AUDIT-V8 — patches lexicaux réellement appliqués (pour log + tests). */
  appliedPatches: string[];
} {
  const { originalPrompt, currentStrategy, previousResults } = context;

  let strengthenedRefs = false;
  let simplifiedScene = false;

  const lastResult = previousResults[previousResults.length - 1];
  const failureReasons = lastResult?.failures ?? [];

  // AUDIT-V8 — étape 1 : patcher le prompt en fonction des VRAIES raisons
  const { patched, appliedPatches } = applyCorrectivePatches(originalPrompt, failureReasons);
  let prompt = patched;

  // AUDIT-V8 — étape 2 : ajouter la consigne de strategy SEULEMENT si elle
  // ne dérive pas déjà des patches lexicaux ci-dessus (évite les redites
  // qui gonflent le prompt à chaque retry).
  switch (currentStrategy) {
    case "same_prompt":
      break;

    case "refined_prompt":
      if (failureReasons.some((f) => f.category === "narrative_fidelity")) {
        prompt += " Ensure the scene clearly shows the intended action and emotional tone.";
      }
      break;

    case "stronger_character_lock":
      strengthenedRefs = true;
      prompt += " CRITICAL: The protagonist must be clearly visible and recognizable. Maintain exact character design.";
      break;

    case "composition_fix":
      prompt +=
        " IMPORTANT: Leave clear space at top or bottom for text bubbles. Avoid cluttered compositions. " +
        "The main subject must be the clear focal point (rule of thirds / center).";
      break;

    case "simplify_scene":
      simplifiedScene = true;
      prompt += " Simplify the scene. Focus on fewer elements. Clear, uncluttered composition.";
      break;

    case "text_space_fix":
      prompt +=
        " Reserve a clean empty band at top or bottom for dialogue balloons; keep faces and main action out of the text zone.";
      break;

    case "style_lock":
      if (!appliedPatches.includes("style_lock_inline")) {
        prompt +=
          " Lock ink style: consistent manga line weight, coherent screentones, no color drift vs reference style.";
      }
      break;
  }

  return { prompt, strengthenedRefs, simplifiedScene, appliedPatches };
}

export function createRetryRecord(
  panelId: string,
  imageUrl: string,
  promptUsed: string,
  qaResult: VisualQaResult,
  strategy: RetryStrategy | null,
): ImageRetryRecord {
  return {
    panelId,
    attemptNumber: qaResult.attemptNumber,
    imageUrl,
    promptUsed,
    qaResult,
    strategy,
    timestamp: new Date().toISOString(),
  };
}
