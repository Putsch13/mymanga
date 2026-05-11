/**
 * Section "PNJ & figurants" — entrée libre + bouton "Analyser" qui appelle
 * `/npc-resolve`, ainsi que la liste fusionnée (persistés + résolus en session)
 * avec un bouton de suppression par ligne.
 */
"use client";

import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { NpcRow } from "./types";

export interface NpcResolverSectionProps {
  rawDescription: string;
  onChangeDescription: (value: string) => void;
  resolving: boolean;
  error: string | null;
  onResolve: () => void;
  rows: NpcRow[];
  onRemove: (row: NpcRow) => void;
}

export function NpcResolverSection({
  rawDescription,
  onChangeDescription,
  resolving,
  error,
  onResolve,
  rows,
  onRemove,
}: NpcResolverSectionProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <p className="text-sm font-medium">PNJ &amp; figurants</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Décris librement les personnages secondaires présents dans cette scène.
        L&apos;IA les mappe sur des archétypes cohérents avec ton univers.
      </p>
      <Textarea
        placeholder="Ex : un vieux gardien borgne qui cache quelque chose, une foule hostile, un enfant qui observe…"
        value={rawDescription}
        onChange={(e) => onChangeDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onResolve();
        }}
        rows={2}
        className="resize-none text-sm"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onResolve}
        disabled={resolving || !rawDescription.trim()}
        className="gap-1.5"
      >
        {resolving ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        {resolving ? "Analyse…" : "Analyser"}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((npc) => (
            <div
              key={`${npc.source}_${npc.id}`}
              className="flex items-start gap-2 rounded-lg border border-border/40 bg-background/30 p-3"
            >
              <div className="flex-1 space-y-1">
                <p className="text-xs font-medium">
                  {npc.label}
                  {npc.source === "draft" ? (
                    <span className="ml-2 text-[10px] text-muted-foreground/70">
                      (persisté)
                    </span>
                  ) : null}
                </p>
                {npc.narrativeHook ? (
                  <p className="text-[11px] text-muted-foreground italic">
                    {npc.narrativeHook}
                  </p>
                ) : null}
                {npc.promptFragment ? (
                  <p className="text-[11px] text-muted-foreground">
                    Visuels : {npc.promptFragment}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onRemove(npc)}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
