"use client";

import type { ChapterStudioData } from "@manga-ai-studio/core";
import { applyHeroInvariant } from "@manga-ai-studio/core";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterPicker } from "@/components/studio/character-picker";
import type { HeroWizardReadiness } from "./chapter-wizard-model";

type CatalogEntry = { id: string; name: string; roleType?: string | null; imageUrl?: string | null };

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function computeReadinessFromCharacterJson(character: unknown): HeroWizardReadiness {
  const c = asRecord(character);
  const locks = Array.isArray(c.visualLocks) ? (c.visualLocks as Record<string, unknown>[]) : [];
  const activeLock =
    locks.find((l) => l?.isActive === true) ?? null;
  const hasVisualLock = Boolean(activeLock);

  const refs = Array.isArray(c.visualRefs) ? (c.visualRefs as Record<string, unknown>[]) : [];
  const activeRefs = refs.filter((r) => !r?.archivedAt);
  const hasFaceRef = activeRefs.some(
    (r) => r?.isPrimary === true || String(r?.type ?? "").toLowerCase().includes("face"),
  ) || Boolean(activeLock && (asRecord(activeLock).faceCloseupAssetId ?? null));

  const outfitDefault = typeof c.outfitDefault === "string" ? c.outfitDefault.trim() : "";
  const lockOutfit = activeLock && typeof activeLock.defaultOutfit === "string" ? activeLock.defaultOutfit.trim() : "";
  const hasOutfit = Boolean(outfitDefault || lockOutfit);

  const pack = c.canonPack ? asRecord(c.canonPack) : null;
  const completeness = typeof pack?.completenessScore === "number" ? pack.completenessScore : 0;
  const canonOk = completeness >= 0.35 || c.canonLocked === true;

  return {
    loaded: true,
    hasVisualLock,
    hasFaceRef,
    hasOutfit,
    canonOk,
  };
}

function statusLabel(ok: boolean, soft?: boolean) {
  if (ok) return <span className="text-emerald-600 dark:text-emerald-400">prêt</span>;
  if (soft) return <span className="text-muted-foreground">—</span>;
  return <span className="text-amber-600 dark:text-amber-400">incomplet</span>;
}

export function ChapterHeroWizardPanel({
  projectId,
  chapterId,
  draft,
  characterCatalog,
  onUpdateDraft,
  onHeroReadinessChange,
}: {
  projectId: string;
  chapterId: string;
  draft: ChapterStudioData;
  characterCatalog: CatalogEntry[];
  onUpdateDraft: (next: ChapterStudioData, step?: "characters" | "canon") => void;
  onHeroReadinessChange: (readiness: HeroWizardReadiness | null) => void;
}) {
  const heroId = draft.characterSelection?.heroCharacterId?.trim() ?? "";
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<HeroWizardReadiness | null>(null);

  const refresh = useCallback(async () => {
    if (!heroId) {
      setLocal(null);
      onHeroReadinessChange(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${heroId}`, { cache: "no-store" });
      const data = (await res.json()) as { character?: unknown; error?: string };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Impossible de charger le héros.");
        onHeroReadinessChange(null);
        setLocal(null);
        return;
      }
      const r = computeReadinessFromCharacterJson(data.character);
      setLocal(r);
      onHeroReadinessChange(r);
    } catch {
      setError("Erreur réseau.");
      onHeroReadinessChange(null);
      setLocal(null);
    } finally {
      setLoading(false);
    }
  }, [heroId, onHeroReadinessChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const returnTo = `/projects/${projectId}/chapters/${chapterId}/edit`;
  const newHeroHref =
    `/projects/${projectId}/characters/new?onboarding=1&returnTo=${encodeURIComponent(returnTo)}`;

  async function triggerVisualLock() {
    if (!heroId || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${heroId}/generate-visual`, { method: "POST" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof j.error === "string" ? j.error : "Génération refusée (stack ou crédits).");
        return;
      }
      await new Promise((r) => setTimeout(r, 600));
      await refresh();
    } catch {
      setError("Erreur réseau pendant la génération.");
    } finally {
      setGenerating(false);
    }
  }

  function patchSelection(patch: Partial<NonNullable<ChapterStudioData["characterSelection"]>>) {
    const prev = draft.characterSelection;
    const merged: NonNullable<ChapterStudioData["characterSelection"]> = {
      heroCharacterId: prev?.heroCharacterId ?? null,
      secondaryHeroCharacterId: prev?.secondaryHeroCharacterId ?? null,
      deuteragonistCharacterId: prev?.deuteragonistCharacterId ?? null,
      coreCastCharacterIds: prev?.coreCastCharacterIds ?? [],
      activeCharacterIds: prev?.activeCharacterIds ?? [],
      lockedCharacterIds: prev?.lockedCharacterIds ?? [],
      speakingCharacterIds: prev?.speakingCharacterIds ?? [],
      evolvingCharacterIds: prev?.evolvingCharacterIds ?? [],
      antagonistCharacterIds: prev?.antagonistCharacterIds ?? [],
      recurringNpcIds: prev?.recurringNpcIds ?? [],
      ...patch,
    };
    const hero = typeof merged.heroCharacterId === "string" ? merged.heroCharacterId.trim() : "";
    const finalSel = hero ? applyHeroInvariant(merged, hero) : merged;
    onUpdateDraft({ ...draft, characterSelection: finalSel }, "characters");
  }

  const designOk = Boolean(local?.hasVisualLock);
  const faceOk = Boolean(local?.hasFaceRef);
  const outfitOk = Boolean(local?.hasOutfit);
  const canonOk = Boolean(local?.canonOk);

  return (
    <Card
      className="border-primary/30 bg-gradient-to-br from-card/90 to-card/50"
      data-testid="chapter-hero-wizard-panel"
      data-studio-field="studio-wizard-hero-panel"
    >
      <CardHeader>
        <CardTitle className="text-base">Qui est le héros principal ?</CardTitle>
        <p className="text-sm text-muted-foreground">
          Chapitre 1 — choisis un personnage existant ou crée-en un nouveau, puis verrouille son design (référence visuelle stable)
          avant de poursuivre le cast.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" asChild>
            <Link href={newHeroHref}>Créer un nouveau héros</Link>
          </Button>
          {heroId ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={`/projects/${projectId}/characters/${heroId}`}>Fiche &amp; références visuelles</Link>
            </Button>
          ) : null}
        </div>

        <div className="max-w-md space-y-2">
          <CharacterPicker
            label="Choisir le héros dans le projet"
            characters={characterCatalog}
            value={heroId || null}
            onChange={(v) => patchSelection({ heroCharacterId: typeof v === "string" ? v : null })}
            multiple={false}
            placeholder="Sélectionne un personnage…"
            dataStudioField="studio-hero-wizard-picker"
          />
        </div>

        {heroId ? (
          <div className="rounded-lg border border-border/50 bg-muted/15 p-3 text-sm space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">Statut canon héros</span>
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>
            <ul className="grid gap-1 sm:grid-cols-2 text-xs">
              <li className="flex justify-between gap-2 border-b border-border/30 pb-1">
                <span>Design (verrou visuel)</span>
                {statusLabel(designOk, !local?.loaded)}
              </li>
              <li className="flex justify-between gap-2 border-b border-border/30 pb-1">
                <span>Référence visage</span>
                {statusLabel(faceOk, !local?.loaded)}
              </li>
              <li className="flex justify-between gap-2 border-b border-border/30 pb-1">
                <span>Tenue</span>
                {statusLabel(outfitOk, !local?.loaded)}
              </li>
              <li className="flex justify-between gap-2 pb-1">
                <span>Canon pack</span>
                {statusLabel(canonOk, !local?.loaded)}
              </li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={generating || loading}
                onClick={() => void triggerVisualLock()}
                data-testid="hero-generate-visual-lock"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Génération…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Générer / mettre à jour le verrou visuel
                  </>
                )}
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => void refresh()}>
                Rafraîchir le statut
              </Button>
            </div>
            {!designOk && local?.loaded ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Sans verrou visuel actif, l&apos;étape « Héros » reste bloquée pour le parcours guidé chapitre 1.
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
