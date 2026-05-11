/**
 * BUG-09 — Rendu éditable d'un beat unique du plan.
 * Ouvre un formulaire inline quand l'utilisateur clique sur "✏️ Réécrire".
 * Le parent reçoit `(beatId, instructions)` et appelle l'autofill
 * `rewrite_beat`.
 */
"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface PlanBeat {
  beatId?: string;
  label?: string;
  summary: string;
}

export interface BeatItemProps {
  beat: PlanBeat;
  index: number;
  fallbackTitle: string;
  onRewriteBeat?: (beatId: string, instructions: string) => void | Promise<void>;
  rewriting?: boolean;
}

export function BeatItem({
  beat,
  index,
  fallbackTitle,
  onRewriteBeat,
  rewriting,
}: BeatItemProps) {
  const [editing, setEditing] = useState(false);
  const [instructions, setInstructions] = useState("");
  const canRewrite = Boolean(beat.beatId && onRewriteBeat);

  const handleSubmit = async () => {
    if (!beat.beatId || !onRewriteBeat) return;
    await onRewriteBeat(beat.beatId, instructions.trim());
    setEditing(false);
    setInstructions("");
  };

  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{beat.label ?? `Temps ${index + 1}`}</p>
          <p className="mt-1 text-muted-foreground">{beat.summary}</p>
        </div>
        {canRewrite && !editing ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0 gap-1 text-xs"
            onClick={() => setEditing(true)}
            disabled={rewriting}
            data-testid={`rewrite-beat-${beat.beatId}`}
          >
            <Pencil className="h-3 w-3" />
            Réécrire
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2 border-t border-border/40 pt-2">
          <Label className="text-xs text-muted-foreground">
            Instructions (facultatif) — ex. « raccourcir », « ajouter un quiproquo entre X et Y »
          </Label>
          <textarea
            className="w-full rounded-md border border-border/60 bg-background/60 p-2 text-sm"
            rows={3}
            maxLength={500}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Précise ce que tu veux modifier dans ce temps…"
            disabled={rewriting}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setInstructions("");
              }}
              disabled={rewriting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={rewriting}
            >
              {rewriting ? "Réécriture…" : "Réécrire ce temps"}
            </Button>
          </div>
        </div>
      ) : null}
      {/* sentinel to silence unused var warning if fallbackTitle unused */}
      <span className="hidden">{fallbackTitle}</span>
    </div>
  );
}
