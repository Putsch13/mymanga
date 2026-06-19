/**
 * Section "PNJ récurrents du projet" — affiche les PNJ déjà identifiés par
 * le système de cohérence inter-chapitres et propose leur promotion en
 * personnage du projet.
 */
"use client";

import type { RecurringNpc } from "./types";

export interface RecurringNpcsSectionProps {
  recurringNpcs: RecurringNpc[];
  onPromote: (stableNpcId: string, currentLabel: string) => void;
}

export function RecurringNpcsSection({
  recurringNpcs,
  onPromote,
}: RecurringNpcsSectionProps) {
  if (recurringNpcs.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-4">
      <p className="text-xs font-medium text-muted-foreground">
        PNJ récurrents du projet
      </p>
      {recurringNpcs.map((npc) => (
        <div
          key={npc.stableNpcId}
          className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 px-3 py-2"
        >
          <div>
            <p className="text-xs font-medium">{npc.label}</p>
            <p className="text-[11px] text-muted-foreground">
              {npc.shortVisualCore.slice(0, 60)}
            </p>
          </div>
          <span className="text-[10px] text-accent">
            {npc.appearanceCount}× apparu
          </span>
          {!npc.isPromotedToCharacter && npc.appearanceCount >= 2 && (
            <button
              type="button"
              onClick={() => onPromote(npc.stableNpcId, npc.label)}
              className="text-[10px] text-violet-400 hover:text-violet-300 underline"
            >
              → Personnage
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
