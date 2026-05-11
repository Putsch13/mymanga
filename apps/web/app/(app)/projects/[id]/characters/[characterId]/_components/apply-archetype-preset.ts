import type { ArchetypePresetPatch } from "@/components/characters/character-archetype-presets";
import type { CharacterPayload } from "./character-types";

/**
 * Applique un preset d'archétype sur un personnage existant **sans écraser**
 * les valeurs déjà saisies par l'utilisateur. Pour chaque sous-objet on
 * fusionne au niveau clé : les champs du preset s'appliquent SEULEMENT là où
 * l'utilisateur n'a pas encore saisi sa propre valeur.
 *
 * Permet d'utiliser un preset comme "starter" sans casser une fiche déjà remplie.
 * Extrait de la page personnage (audit-v9) pour rester sous 500 lignes.
 */
export function applyArchetypePresetPatch(
  prev: CharacterPayload,
  patch: ArchetypePresetPatch,
): CharacterPayload {
  const merged: CharacterPayload = { ...prev };

  const mergeRecord = (
    base: Record<string, unknown>,
    override: Record<string, unknown> | undefined,
  ): Record<string, unknown> => {
    if (!override) return base;
    const next: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(override)) {
      const cur = next[k];
      const isEmpty =
        cur === undefined ||
        cur === null ||
        (typeof cur === "string" && cur.trim() === "") ||
        (Array.isArray(cur) && cur.length === 0);
      if (isEmpty) next[k] = v;
    }
    return next;
  };

  merged.visualProfile = mergeRecord(prev.visualProfile, patch.visualProfile);
  merged.bodyState = mergeRecord(prev.bodyState, patch.bodyState);
  merged.wardrobeProfile = mergeRecord(prev.wardrobeProfile, patch.wardrobeProfile);
  merged.speechProfile = mergeRecord(prev.speechProfile, patch.speechProfile);

  const isVoiceEmpty = (v: unknown) => v === undefined || v === null || v === "";

  if (patch.voiceRegister !== undefined && isVoiceEmpty(prev.voiceRegister)) {
    merged.voiceRegister = patch.voiceRegister;
  }
  if (patch.voiceSentenceLength !== undefined && isVoiceEmpty(prev.voiceSentenceLength)) {
    merged.voiceSentenceLength = patch.voiceSentenceLength;
  }
  if (patch.voiceVocabularyStyle !== undefined && isVoiceEmpty(prev.voiceVocabularyStyle)) {
    merged.voiceVocabularyStyle = patch.voiceVocabularyStyle;
  }
  if (patch.voiceEmotionalLeak !== undefined && isVoiceEmpty(prev.voiceEmotionalLeak)) {
    merged.voiceEmotionalLeak = patch.voiceEmotionalLeak;
  }
  if (patch.voiceSarcasmLevel !== undefined && isVoiceEmpty(prev.voiceSarcasmLevel)) {
    merged.voiceSarcasmLevel = patch.voiceSarcasmLevel;
  }
  if (patch.voiceAggressionLevel !== undefined && isVoiceEmpty(prev.voiceAggressionLevel)) {
    merged.voiceAggressionLevel = patch.voiceAggressionLevel;
  }
  if (patch.voiceSilenceFrequency !== undefined && isVoiceEmpty(prev.voiceSilenceFrequency)) {
    merged.voiceSilenceFrequency = patch.voiceSilenceFrequency;
  }
  if (patch.voiceFavoriteExpressions && prev.voiceFavoriteExpressions.length === 0) {
    merged.voiceFavoriteExpressions = patch.voiceFavoriteExpressions;
  }
  if (patch.voiceForbiddenExpressions && prev.voiceForbiddenExpressions.length === 0) {
    merged.voiceForbiddenExpressions = patch.voiceForbiddenExpressions;
  }
  if (patch.roleType && (!prev.roleType || prev.roleType.trim() === "")) {
    merged.roleType = patch.roleType;
  }

  return merged;
}
