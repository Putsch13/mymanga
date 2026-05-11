"use client";

import type { CharacterPayload } from "./character-types";

interface CanonPolicyBlockProps {
  character: CharacterPayload;
  onPatch: (patch: Partial<CharacterPayload>) => void;
}

/**
 * Bloc "Politique de changement" + preview DNA stable, extrait de l'onglet
 * Canon (audit-v9, < 500 lignes).
 */
export function CanonPolicyBlock({ character, onPatch }: CanonPolicyBlockProps) {
  return (
    <>
      <div className="mt-4 space-y-3 rounded-lg border border-amber-500/30 bg-amber-950/10 p-3">
        <h4 className="text-sm font-semibold text-amber-300">Politique de changement</h4>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={character.canChangeHair}
              onChange={(e) => onPatch({ canChangeHair: e.target.checked })}
              className="rounded"
            />
            <span>Peut changer de cheveux</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={character.canChangeOutfitFreely}
              onChange={(e) => onPatch({ canChangeOutfitFreely: e.target.checked })}
              className="rounded"
            />
            <span>Peut changer de tenue librement</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={character.canChangeVisibleScars}
              onChange={(e) => onPatch({ canChangeVisibleScars: e.target.checked })}
              className="rounded"
            />
            <span>Peut perdre des cicatrices</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={character.canChangeSpeechRegister}
              onChange={(e) => onPatch({ canChangeSpeechRegister: e.target.checked })}
              className="rounded"
            />
            <span>Peut changer de registre de voix</span>
          </label>
        </div>
      </div>

      {Object.keys(character.stableVisualDNA).length > 0 ? (
        <div className="mt-4 rounded-lg border border-stone-700 bg-stone-950/30 p-3">
          <h4 className="mb-2 text-xs font-semibold text-stone-300">DNA visuelle stable</h4>
          <pre className="text-[10px] text-stone-400">
            {JSON.stringify(character.stableVisualDNA, null, 2)}
          </pre>
        </div>
      ) : null}
    </>
  );
}
