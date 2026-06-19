/**
 * Liste de beats avec ouverture/fermeture optionnelle.
 *
 * Le mode `defaultCollapsed` est utilisé pour la "vue macro" (5 grands temps)
 * quand le plan détaillé contient déjà plus de beats — pour éviter d'avoir
 * la même information affichée deux fois sans repli.
 */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BeatItem, type PlanBeat } from "./beat-item";

export interface BeatListProps {
  title: string;
  subtitle?: string;
  emptyLabel: string;
  beats: PlanBeat[] | undefined;
  defaultCollapsed?: boolean;
  onRewriteBeat?: (beatId: string, instructions: string) => void | Promise<void>;
  rewriting?: boolean;
}

export function BeatList({
  title,
  subtitle,
  emptyLabel,
  beats,
  defaultCollapsed,
  onRewriteBeat,
  rewriting,
}: BeatListProps) {
  if (defaultCollapsed && (beats ?? []).length > 0) {
    return (
      <details className="rounded-xl border border-border/60 bg-card/40">
        <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium">
          <span>{title}</span>
          <span className="text-xs text-muted-foreground">
            {(beats ?? []).length} temps · cliquer pour voir
          </span>
        </summary>
        <div className="space-y-3 px-4 pb-4 text-sm">
          {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
          {beats?.map((beat, index) => (
            <BeatItem
              key={beat.beatId ?? `${title}-${index}`}
              beat={beat}
              index={index}
              fallbackTitle={title}
              onRewriteBeat={onRewriteBeat}
              rewriting={rewriting}
            />
          ))}
        </div>
      </details>
    );
  }

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {(beats ?? []).length > 0 ? (
          beats?.map((beat, index) => (
            <BeatItem
              key={beat.beatId ?? `${title}-${index}`}
              beat={beat}
              index={index}
              fallbackTitle={title}
              onRewriteBeat={onRewriteBeat}
              rewriting={rewriting}
            />
          ))
        ) : (
          <p className="text-muted-foreground">{emptyLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}
