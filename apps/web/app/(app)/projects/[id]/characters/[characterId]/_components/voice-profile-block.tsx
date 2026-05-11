"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CharacterPayload } from "./character-types";

interface VoiceProfileBlockProps {
  character: CharacterPayload;
  onPatch: (patch: Partial<CharacterPayload>) => void;
}

/**
 * Bloc "Profil de voix (Continuity Engine)" extrait de l'onglet Voix
 * (audit-v9, < 500 lignes). Gère registre, longueur, vocab, expressivité,
 * sarcasme, silence, expressions favorites/interdites, styles menace/mensonge.
 */
export function VoiceProfileBlock({ character, onPatch }: VoiceProfileBlockProps) {
  return (
    <div className="mt-4 space-y-3 rounded-lg border border-violet-500/30 bg-violet-950/10 p-3">
      <h4 className="text-sm font-semibold text-violet-300">Profil de voix (Continuity Engine)</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Registre</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            value={character.voiceRegister ?? ""}
            onChange={(e) => onPatch({ voiceRegister: e.target.value || null })}
          >
            <option value="">Aucun</option>
            <option value="very_formal">Très formel</option>
            <option value="formal">Formel</option>
            <option value="neutral">Neutre</option>
            <option value="casual">Casual</option>
            <option value="rough">Brut / Argot</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Longueur phrases</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            value={character.voiceSentenceLength ?? ""}
            onChange={(e) => onPatch({ voiceSentenceLength: e.target.value || null })}
          >
            <option value="">Aucun</option>
            <option value="very_short">Très courtes</option>
            <option value="short">Courtes</option>
            <option value="medium">Moyennes</option>
            <option value="long">Longues</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Style de vocabulaire</Label>
        <Input
          placeholder="ex: poétique, technique, argot..."
          value={character.voiceVocabularyStyle ?? ""}
          onChange={(e) => onPatch({ voiceVocabularyStyle: e.target.value || null })}
          className="text-xs"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Expressivité (0-1)</Label>
          <Input
            type="number"
            min="0"
            max="1"
            step="0.1"
            placeholder="0.5"
            value={character.voiceEmotionalLeak ?? ""}
            onChange={(e) =>
              onPatch({ voiceEmotionalLeak: e.target.value ? parseFloat(e.target.value) : null })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Sarcasme (0-1)</Label>
          <Input
            type="number"
            min="0"
            max="1"
            step="0.1"
            placeholder="0.3"
            value={character.voiceSarcasmLevel ?? ""}
            onChange={(e) =>
              onPatch({ voiceSarcasmLevel: e.target.value ? parseFloat(e.target.value) : null })
            }
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Silence (0-1)</Label>
          <Input
            type="number"
            min="0"
            max="1"
            step="0.1"
            placeholder="0.2"
            value={character.voiceSilenceFrequency ?? ""}
            onChange={(e) =>
              onPatch({ voiceSilenceFrequency: e.target.value ? parseFloat(e.target.value) : null })
            }
            className="text-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Expressions favorites (séparées par virgule)</Label>
        <Textarea
          placeholder="ex: Hmph, Tch, Bon sang..."
          value={character.voiceFavoriteExpressions.join(", ")}
          onChange={(e) =>
            onPatch({ voiceFavoriteExpressions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
          }
          className="text-xs"
          rows={2}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-red-400">
          Expressions INTERDITES (séparées par virgule)
        </Label>
        <Textarea
          placeholder="ex: bien sûr, évidemment..."
          value={character.voiceForbiddenExpressions.join(", ")}
          onChange={(e) =>
            onPatch({ voiceForbiddenExpressions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
          }
          className="text-xs"
          rows={2}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Style de menace</Label>
          <Input
            placeholder="ex: direct, subtil, froid"
            value={character.voiceThreatenStyle ?? ""}
            onChange={(e) => onPatch({ voiceThreatenStyle: e.target.value || null })}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Style de mensonge</Label>
          <Input
            placeholder="ex: omission, bold"
            value={character.voiceLieStyle ?? ""}
            onChange={(e) => onPatch({ voiceLieStyle: e.target.value || null })}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  );
}
