/**
 * T06 — Validate coherence between ContinuityKernel (canonical) and ChapterCanonState (snapshot).
 *
 * The kernel is the source of truth. ChapterCanonState is a materialized view.
 * This function diffs field-by-field and logs divergences without silently overwriting.
 */

import type { ContinuityKernel, CharacterState } from "./types";

export interface ContinuityDivergence {
  characterId: string;
  characterName: string;
  field: string;
  kernelValue: unknown;
  chapterCanonValue: unknown;
  resolvedTo: "kernel" | "chapter_canon";
  reason: string;
}

export interface KernelCoherenceResult {
  coherent: boolean;
  divergences: ContinuityDivergence[];
  warnings: string[];
}

export function validateKernelCoherence(
  kernel: ContinuityKernel,
  chapterCanonState: {
    characterStates?: CharacterState[];
    worldState?: Record<string, unknown>;
  } | null,
): KernelCoherenceResult {
  const divergences: ContinuityDivergence[] = [];
  const warnings: string[] = [];

  if (!chapterCanonState || !chapterCanonState.characterStates) {
    return { coherent: true, divergences: [], warnings: ["no chapter canon state to compare"] };
  }

  const canonStates = chapterCanonState.characterStates;

  for (const kernelState of kernel.characterStates) {
    const canonState = canonStates.find(
      (cs) => cs.characterId === kernelState.characterId,
    );

    if (!canonState) {
      warnings.push(`character ${kernelState.characterId} (${kernelState.identity.stableName}) present in kernel but missing from ChapterCanonState`);
      continue;
    }

    const name = kernelState.identity.stableName ?? kernelState.characterId;

    if (kernelState.currentState.emotion !== canonState.currentState.emotion) {
      divergences.push({
        characterId: kernelState.characterId,
        characterName: name,
        field: "currentState.emotion",
        kernelValue: kernelState.currentState.emotion,
        chapterCanonValue: canonState.currentState.emotion,
        resolvedTo: "kernel",
        reason: "kernel is canonical source of truth",
      });
    }

    const kernelInjuries = kernelState.currentState.injuries ?? [];
    const canonInjuries = canonState.currentState.injuries ?? [];
    if (kernelInjuries.length !== canonInjuries.length) {
      divergences.push({
        characterId: kernelState.characterId,
        characterName: name,
        field: "currentState.injuries.length",
        kernelValue: kernelInjuries.length,
        chapterCanonValue: canonInjuries.length,
        resolvedTo: "kernel",
        reason: "injury count mismatch",
      });
    }

    if (kernelState.currentState.outfit !== canonState.currentState.outfit) {
      divergences.push({
        characterId: kernelState.characterId,
        characterName: name,
        field: "currentState.outfit",
        kernelValue: kernelState.currentState.outfit,
        chapterCanonValue: canonState.currentState.outfit,
        resolvedTo: "kernel",
        reason: "outfit divergence",
      });
    }

    if (kernelState.currentState.location !== canonState.currentState.location) {
      divergences.push({
        characterId: kernelState.characterId,
        characterName: name,
        field: "currentState.location",
        kernelValue: kernelState.currentState.location,
        chapterCanonValue: canonState.currentState.location,
        resolvedTo: "kernel",
        reason: "location divergence",
      });
    }
  }

  for (const canonState of canonStates) {
    if (!kernel.characterStates.find((ks) => ks.characterId === canonState.characterId)) {
      warnings.push(`character ${canonState.characterId} present in ChapterCanonState but missing from kernel`);
    }
  }

  return {
    coherent: divergences.length === 0,
    divergences,
    warnings,
  };
}
