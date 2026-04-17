"use client";

/**
 * MOAT-1 — Vue UI évolution canonique cross-chapitre.
 *
 * Affiche la timeline d'apparition d'un personnage chapitre par chapitre :
 *  - Vignette de la meilleure image (panel focus, score consistency max)
 *  - Événements canon (CanonTimelineEvent)
 *  - Changements canon demandés (CanonChangeRequest)
 *
 * Permet à l'auteur de détecter visuellement une dérive d'apparence ou
 * une incohérence majeure d'un chapitre à l'autre.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { safeFetch } from "@/lib/safe-fetch";
import { resolveImageUrl } from "@/lib/images/proxy-url";

type EvolutionPayload = {
  characterId: string;
  characterName: string;
  projectId: string;
  chapters: Array<{
    chapterId: string;
    chapterNumber: number;
    title: string | null;
    status: string;
    appearancesCount: number;
    bestImage: {
      sceneImageId: string;
      url: string | null;
      consistencyScore: number | null;
      isFocus: boolean;
    } | null;
    events: Array<{
      id: string;
      eventType: string;
      title: string;
      description: string;
      importance: string;
      irreversible: boolean;
    }>;
    changes: Array<{ id: string; type: string; status: string }>;
  }>;
};

interface Props {
  characterId: string;
}

function importanceBadge(importance: string) {
  if (importance === "critical") {
    return "bg-red-900/40 text-red-300 border-red-700/40";
  }
  if (importance === "major") {
    return "bg-amber-900/40 text-amber-300 border-amber-700/40";
  }
  return "bg-stone-800/40 text-stone-300 border-stone-700/40";
}

function scoreColor(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 0.85) return "text-emerald-400";
  if (score >= 0.7) return "text-amber-400";
  return "text-red-400";
}

export function CharacterCanonEvolution({ characterId }: Props) {
  const [data, setData] = useState<EvolutionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await safeFetch<EvolutionPayload>(
        `/api/characters/${characterId}/canon-evolution`,
      );
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setData(res.data);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de l&apos;évolution canonique…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-400">
        Impossible de charger l&apos;évolution canonique : {error}
      </p>
    );
  }

  if (!data || data.chapters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ce personnage n&apos;apparaît dans aucun chapitre généré pour le moment. Lance la génération
        d&apos;un chapitre pour visualiser son évolution canonique.
      </p>
    );
  }

  const driftWarnings: string[] = [];
  const scores = data.chapters
    .map((c) => c.bestImage?.consistencyScore ?? null)
    .filter((s): s is number => typeof s === "number");
  if (scores.length >= 2) {
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    if (max - min > 0.2) {
      driftWarnings.push(
        `Variation de consistency score de ${(min * 100).toFixed(0)}% à ${(max * 100).toFixed(0)}% — vérifier la cohérence visuelle entre chapitres.`,
      );
    }
  }
  const irreversibleCount = data.chapters.reduce(
    (acc, c) => acc + c.events.filter((e) => e.irreversible).length,
    0,
  );
  if (irreversibleCount > 0) {
    driftWarnings.push(
      `${irreversibleCount} événement(s) canon irréversible(s) — toute génération future doit refléter ces changements.`,
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Évolution canonique cross-chapitre</h3>
          <p className="text-xs text-muted-foreground">
            {data.chapters.length} chapitre(s) avec apparition ou changement canon de{" "}
            <span className="font-medium text-foreground">{data.characterName}</span>.
          </p>
        </div>
      </div>

      {driftWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 space-y-1">
          {driftWarnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-200">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-min">
          {data.chapters.map((chapter) => (
            <Card
              key={chapter.chapterId}
              className="border-border/60 bg-card/50 w-[260px] flex-shrink-0"
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Chapitre {chapter.chapterNumber}</CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {chapter.status}
                  </Badge>
                </div>
                {chapter.title && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{chapter.title}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {chapter.bestImage?.url ? (
                  <div className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolveImageUrl(chapter.bestImage.url) ?? chapter.bestImage.url}
                      alt={`${data.characterName} — chapitre ${chapter.chapterNumber}`}
                      className="h-40 w-full rounded-md object-cover"
                      loading="lazy"
                    />
                    <div className="flex items-center justify-between text-[10px]">
                      <span
                        className={
                          chapter.bestImage.isFocus
                            ? "text-emerald-400"
                            : "text-muted-foreground"
                        }
                      >
                        {chapter.bestImage.isFocus ? "focus" : "supporting"}
                      </span>
                      <span
                        className={`font-mono ${scoreColor(chapter.bestImage.consistencyScore)}`}
                      >
                        {chapter.bestImage.consistencyScore !== null
                          ? `${(chapter.bestImage.consistencyScore * 100).toFixed(0)}%`
                          : "—"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="h-40 w-full rounded-md border border-dashed border-border/60 flex items-center justify-center text-[11px] text-muted-foreground">
                    Pas d&apos;image disponible
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  {chapter.appearancesCount} apparition(s) dans ce chapitre
                </p>

                {chapter.events.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Événements
                    </p>
                    {chapter.events.map((e) => (
                      <div key={e.id} className="rounded border border-border/40 p-1.5 space-y-0.5">
                        <div className="flex items-center gap-1">
                          <Badge className={`${importanceBadge(e.importance)} text-[9px]`}>
                            {e.eventType}
                          </Badge>
                          {e.irreversible && (
                            <span className="text-[9px] text-red-300">irréversible</span>
                          )}
                        </div>
                        <p className="text-[11px] font-medium leading-tight">{e.title}</p>
                        <p className="text-[10px] text-muted-foreground line-clamp-3">
                          {e.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {chapter.changes.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Changements canon
                    </p>
                    {chapter.changes.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between text-[10px] text-amber-200"
                      >
                        <span>{c.type}</span>
                        <span className="text-muted-foreground">{c.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
