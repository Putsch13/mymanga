"use client";

import type { ChapterStudioData, LocationCanon } from "@manga-ai-studio/core";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/studio/tag-input";
import { syncLocationCanonsToVisualWorld } from "@/lib/chapter-studio/sync-location-canons-to-visual-world";

function newLocationCanon(partial: Partial<LocationCanon> & { label: string }): LocationCanon {
  return {
    locationId: partial.locationId ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `loc-${Date.now()}`),
    label: partial.label,
    visualMarkers: partial.visualMarkers ?? [],
    architecture: partial.architecture ?? [],
    density: partial.density ?? null,
    atmosphere: partial.atmosphere ?? [],
    timeOfDayVariants: partial.timeOfDayVariants ?? [],
    weatherVariants: partial.weatherVariants ?? [],
    mustKeep: partial.mustKeep ?? [],
    forbiddenDrift: partial.forbiddenDrift ?? [],
    isPrimary: partial.isPrimary ?? false,
    visualBrief: partial.visualBrief ?? null,
    locationType: partial.locationType ?? null,
    fixedElements: partial.fixedElements ?? [],
    lightingRules: partial.lightingRules ?? [],
    palette: partial.palette ?? [],
    referenceImages: partial.referenceImages ?? [],
  };
}

export function ChapterLocationsWizardPanel({
  chapterId,
  draft,
  onUpdateDraft,
}: {
  chapterId: string;
  draft: ChapterStudioData;
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
}) {
  const canons = draft.locationCanons ?? [];
  const intentLocs = draft.chapterIntentContract?.requiredLocations ?? [];

  const primaryCount = useMemo(() => canons.filter((c) => c.isPrimary).length, [canons]);

  function replaceCanons(next: LocationCanon[]) {
    onUpdateDraft({ ...draft, locationCanons: next }, "canon");
  }

  function patchCanon(index: number, patch: Partial<LocationCanon>) {
    const next = canons.map((c, i) => (i === index ? { ...c, ...patch } : c));
    replaceCanons(next);
  }

  function addLocation(label = "Nouveau décor") {
    const isFirst = canons.length === 0;
    const row = newLocationCanon({
      label,
      isPrimary: isFirst,
    });
    replaceCanons([...canons, row]);
  }

  function removeCanon(index: number) {
    const next = canons.filter((_, i) => i !== index);
    if (next.length === 1) next[0] = { ...next[0]!, isPrimary: true };
    replaceCanons(next);
  }

  function setPrimary(locationId: string) {
    replaceCanons(
      canons.map((c) => ({ ...c, isPrimary: c.locationId === locationId })),
    );
  }

  function runSyncVisualWorld() {
    if (canons.length === 0) return;
    const vw = syncLocationCanonsToVisualWorld({ chapterId, draft });
    onUpdateDraft({ ...draft, visualWorldContract: vw }, "canon");
  }

  return (
    <Card className="border-sky-500/25 bg-card/50" data-testid="chapter-locations-wizard-panel">
      <CardHeader>
        <CardTitle className="text-base">Où se passe ton chapitre ?</CardTitle>
        <p className="text-sm text-muted-foreground">
          Chapitre 1 — définis un décor principal et des lieux secondaires, puis synchronise vers le{' '}
          <span className="font-medium text-foreground">contrat monde visuel</span> utilisé par la génération premium.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {intentLocs.length > 0 ? (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs space-y-2">
            <p className="font-medium text-foreground">Lieux détectés dans l&apos;intention</p>
            <div className="flex flex-wrap gap-2">
              {intentLocs.map((loc) => (
                <Button key={loc} type="button" size="sm" variant="outline" className="h-7" onClick={() => addLocation(loc)}>
                  + {loc}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {primaryCount === 0 && canons.length > 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Indique quel décor est le <span className="font-medium">principal</span> (bouton « Principal » sur une ligne).
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => addLocation("Nouveau décor")}>
            Ajouter un décor
          </Button>
          <Button type="button" size="sm" variant="default" disabled={canons.length === 0} onClick={runSyncVisualWorld}>
            Synchroniser → monde visuel
          </Button>
        </div>

        {draft.visualWorldContract?.locations?.length ? (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
            Monde visuel : {draft.visualWorldContract.locations.length} lieu(x) — prêt côté pipeline.
          </p>
        ) : canons.length > 0 ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Lieux studio renseignés — clique « Synchroniser » pour alimenter le contrat monde visuel.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Aucun décor — étape bloquée pour le parcours chapitre 1.</p>
        )}

        <div className="space-y-4">
          {canons.map((c, index) => (
            <div key={c.locationId} className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={c.isPrimary ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setPrimary(c.locationId)}
                  >
                    {c.isPrimary ? "Décor principal" : "Définir principal"}
                  </Button>
                  <span className="text-[10px] text-muted-foreground font-mono">{c.locationId.slice(0, 8)}…</span>
                </div>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => removeCanon(index)}>
                  Retirer
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Nom du lieu</Label>
                  <Input value={c.label} onChange={(e) => patchCanon(index, { label: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type (ville, intérieur, toit…)</Label>
                  <Input
                    value={c.locationType ?? ""}
                    onChange={(e) => patchCanon(index, { locationType: e.target.value || null })}
                    placeholder="ex. ville cyberpunk"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Brief visuel</Label>
                <Textarea
                  rows={2}
                  value={c.visualBrief ?? ""}
                  onChange={(e) => patchCanon(index, { visualBrief: e.target.value || null })}
                  placeholder="Silhouette des bâtiments, pluie néon, foule…"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ambiance (tags)</Label>
                <TagInput values={c.atmosphere} onChange={(v) => patchCanon(index, { atmosphere: v })} placeholder="pluie, tension…" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Éléments fixes</Label>
                  <TagInput values={c.fixedElements} onChange={(v) => patchCanon(index, { fixedElements: v })} placeholder="enseignes, rails…" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Éclairage</Label>
                  <TagInput values={c.lightingRules} onChange={(v) => patchCanon(index, { lightingRules: v })} placeholder="néon, contre-jour…" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Palette</Label>
                  <TagInput values={c.palette} onChange={(v) => patchCanon(index, { palette: v })} placeholder="#0a0a12, magenta…" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Interdits visuels (dérive)</Label>
                  <TagInput
                    values={c.forbiddenDrift}
                    onChange={(v) => patchCanon(index, { forbiddenDrift: v })}
                    placeholder="pas de jour ensoleillé…"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Références (URLs stables)</Label>
                <TagInput
                  values={c.referenceImages}
                  onChange={(v) => patchCanon(index, { referenceImages: v })}
                  placeholder="https://…"
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
