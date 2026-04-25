"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type ChapterVisualContractUiClient = {
  parasitePolicy: "auto_strip" | "keep_all";
  preLaunchAcknowledged?: boolean;
};

export function ChapterVisualContractPolicyPanel({
  projectId,
  chapterId,
  ui,
  generatedImages,
  planReadyForFirstLaunch,
  onUpdated,
}: {
  projectId: string;
  chapterId: string;
  ui: ChapterVisualContractUiClient | null | undefined;
  generatedImages: number;
  /** Plan images complet (blueprints ≥ minimum) — requis pour afficher la confirmation pré-lancement. */
  planReadyForFirstLaunch: boolean;
  onUpdated: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policy = ui?.parasitePolicy ?? "auto_strip";
  const preLaunchOk = ui?.preLaunchAcknowledged === true;

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/visual-contract-ui`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
        if (!res.ok) {
          setError(typeof json.message === "string" ? json.message : "Sauvegarde impossible.");
          return;
        }
        await onUpdated();
      } catch {
        setError("Erreur réseau.");
      } finally {
        setSaving(false);
      }
    },
    [chapterId, onUpdated, projectId],
  );

  const showPrelaunch = generatedImages === 0 && planReadyForFirstLaunch;

  return (
    <Card className="border-violet-500/25 bg-violet-500/[0.06]" data-testid="visual-contract-policy-panel">
      <CardHeader>
        <CardTitle className="text-base">Contrat visuel — politique d’obligations</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ces réglages sont enregistrés sur le chapitre et influencent la fusion des obligations visuelles lors du
          pipeline premium (sanitation du plan brut + couverture).
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Artefacts « parasites » issus du plan de production</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={policy === "auto_strip" ? "default" : "outline"}
              disabled={saving}
              onClick={() => void patch({ parasitePolicy: "auto_strip" })}
              data-testid="visual-contract-policy-auto-strip"
            >
              Supprimer automatiquement
            </Button>
            <Button
              type="button"
              size="sm"
              variant={policy === "keep_all" ? "default" : "outline"}
              disabled={saving}
              onClick={() => void patch({ parasitePolicy: "keep_all" })}
              data-testid="visual-contract-policy-keep-all"
            >
              Garder quand même
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Supprimer automatiquement</strong> : la couverture visuelle stricte suit surtout le contrat chapitre
            extrait par l’IA ; les créatures / ennemis dédiés absents du texte du chapitre ne sont pas fusionnés depuis
            le plan brut.
            <br />
            <strong>Garder quand même</strong> : fusion avec les obligations dérivées du plan (y compris les entrées
            marquées « suspectes » par le filtre outline).
          </p>
        </div>

        {showPrelaunch ? (
          <div className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-2">
            <p className="text-xs font-medium text-foreground/90">Avant le tout premier lancement</p>
            {preLaunchOk ? (
              <p className="text-xs text-green-600 dark:text-green-400">Confirmation enregistrée — tu peux lancer la génération.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Confirme que tu as pris connaissance de ce panneau et du contrat visuel affiché dans l’étape Plan /
                  Génération. Obligatoire une fois par chapitre tant qu’aucune image n’a été générée.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void patch({ preLaunchAcknowledged: true })}
                  data-testid="visual-contract-prelaunch-ack"
                >
                  J’ai vérifié — débloquer le lancement
                </Button>
              </>
            )}
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
