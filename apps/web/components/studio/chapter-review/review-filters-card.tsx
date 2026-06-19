/**
 * Carte de filtres review : statut, criticité, QA visuelle, score.
 */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FilterState } from "./types";

export interface ReviewFiltersCardProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
}

export function ReviewFiltersCard({ filters, onChange }: ReviewFiltersCardProps) {
  const update = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    onChange({ ...filters, [key]: value });
  };
  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader>
        <CardTitle className="text-base">Filtres review</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
        <label className="space-y-1">
          <span className="text-muted-foreground">Statut</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2"
            value={filters.status}
            onChange={(event) =>
              update("status", event.target.value as FilterState["status"])
            }
          >
            <option value="all">Tous</option>
            <option value="completed">Acceptés</option>
            <option value="blocked">Bloqués</option>
            <option value="failed">Échoués</option>
            <option value="pending">En attente</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Criticité</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2"
            value={filters.criticality}
            onChange={(event) =>
              update("criticality", event.target.value as FilterState["criticality"])
            }
          >
            <option value="all">Toutes</option>
            <option value="critical">Critiques</option>
            <option value="non_critical">Non critiques</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">QA visuelle</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2"
            value={filters.qa}
            onChange={(event) => update("qa", event.target.value as FilterState["qa"])}
          >
            <option value="all">Toutes</option>
            <option value="missing">QA manquante</option>
            <option value="executed">QA exécutée</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-muted-foreground">Score</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2"
            value={filters.score}
            onChange={(event) =>
              update("score", event.target.value as FilterState["score"])
            }
          >
            <option value="all">Tous</option>
            <option value="weak">Panels faibles (&lt; 0.72)</option>
          </select>
        </label>
      </CardContent>
    </Card>
  );
}
