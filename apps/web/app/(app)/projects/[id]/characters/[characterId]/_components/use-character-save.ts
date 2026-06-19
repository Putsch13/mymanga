/**
 * P5.4 — Hook de sauvegarde + auto-génération visuel.
 *
 * Extrait le bloc save() de la page character pour :
 *   1. Regrouper le mapping payload (35+ champs) en un seul endroit.
 *   2. Isoler l'auto-gen visuel (quand le perso n'a encore aucun visual ref).
 *   3. Simplifier les tests : on peut mocker safeFetch / fetch sur ce hook.
 *
 * La page reste propriétaire du state `character` : le hook ne la mute pas,
 * il applique son `patch` à travers les setters fournis.
 */

"use client";

import { useState } from "react";
import { safeFetch } from "@/lib/safe-fetch";
import type { CharacterPayload } from "./character-types";

type ToastMessage = { text: string; type: "ok" | "error" };

export type UseCharacterSaveInput = {
  characterId: string;
  character: CharacterPayload | null;
  setCharacter: (updater: (prev: CharacterPayload | null) => CharacterPayload | null) => void;
  setMessage: (msg: ToastMessage | null) => void;
};

export type UseCharacterSaveResult = {
  saving: boolean;
  autoGenerating: boolean;
  save: () => Promise<void>;
};

export function useCharacterSave(input: UseCharacterSaveInput): UseCharacterSaveResult {
  const { characterId, character, setCharacter, setMessage } = input;
  const [saving, setSaving] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);

  async function save(): Promise<void> {
    if (!character) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/characters/${characterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSavePayload(character)),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage({ text: json.message ?? "Erreur de sauvegarde", type: "error" });
      return;
    }
    const savedCharacter = { ...character, ...json.character };
    setCharacter((prev) => (prev ? { ...prev, ...json.character } : prev));

    const hasAnyVisual = (savedCharacter.visualRefs ?? []).length > 0;
    const hasVisualInfo = savedCharacter.appearance || savedCharacter.hairColor || savedCharacter.eyeColor || savedCharacter.name;

    if (!hasAnyVisual && hasVisualInfo) {
      setMessage({ text: "Fiche sauvegardée. Génération du visuel en cours…", type: "ok" });
      setAutoGenerating(true);
      const result = await safeFetch<{ visualRef: CharacterPayload["visualRefs"][0] }>(
        `/api/characters/${characterId}/generate-visual`,
        { method: "POST" },
      );
      setAutoGenerating(false);
      if (result.ok) {
        setCharacter((current) =>
          current ? { ...current, visualRefs: [result.data.visualRef, ...(current.visualRefs ?? [])] } : current,
        );
        setMessage({ text: "Fiche sauvegardée et visuel généré.", type: "ok" });
      } else {
        setMessage({ text: "Fiche sauvegardée. Génération du visuel échouée (relance manuellement).", type: "ok" });
      }
    } else {
      setMessage({ text: "Fiche sauvegardée.", type: "ok" });
    }
  }

  return { saving, autoGenerating, save };
}

function buildSavePayload(character: CharacterPayload): Record<string, unknown> {
  return {
    name: character.name,
    roleType: character.roleType,
    gender: character.gender,
    biography: character.biography,
    age: character.age,
    adultVerified: character.adultVerified,
    objective: character.objective,
    fear: character.fear,
    trauma: character.trauma,
    emotionalState: character.emotionalState,
    status: character.status,
    canonLocked: character.canonLocked,
    traits: character.traits,
    flaws: character.flaws,
    secrets: character.secrets,
    appearance: character.appearance,
    hairColor: character.hairColor,
    eyeColor: character.eyeColor,
    outfitDefault: character.outfitDefault,
    visualProfile: character.visualProfile,
    bodyState: character.bodyState,
    wardrobeProfile: character.wardrobeProfile,
    speechProfile: character.speechProfile,
    continuityProfile: character.continuityProfile,
    adultContentProfile: character.adultContentProfile,
    voiceRegister: character.voiceRegister,
    voiceSentenceLength: character.voiceSentenceLength,
    voiceVocabularyStyle: character.voiceVocabularyStyle,
    voiceEmotionalLeak: character.voiceEmotionalLeak,
    voiceSarcasmLevel: character.voiceSarcasmLevel,
    voiceAggressionLevel: character.voiceAggressionLevel,
    voiceSilenceFrequency: character.voiceSilenceFrequency,
    voiceFavoriteExpressions: character.voiceFavoriteExpressions,
    voiceForbiddenExpressions: character.voiceForbiddenExpressions,
    voiceForbiddenPatterns: character.voiceForbiddenPatterns,
    voiceThreatenStyle: character.voiceThreatenStyle,
    voiceLieStyle: character.voiceLieStyle,
    voiceSeductionStyle: character.voiceSeductionStyle,
    voiceInnerMonologueStyle: character.voiceInnerMonologueStyle,
    voiceExamplesCanonical: character.voiceExamplesCanonical,
    voiceSpeechRules: character.voiceSpeechRules,
    stableVisualDNA: character.stableVisualDNA,
    stableSpeechDNA: character.stableSpeechDNA,
    stablePsycheDNA: character.stablePsycheDNA,
    canChangeHair: character.canChangeHair,
    canChangeOutfitFreely: character.canChangeOutfitFreely,
    canChangeVisibleScars: character.canChangeVisibleScars,
    canChangeSpeechRegister: character.canChangeSpeechRegister,
    requiresCanonApprovalFor: character.requiresCanonApprovalFor,
  };
}
