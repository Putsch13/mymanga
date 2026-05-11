/**
 * Métriques "legacy" du `productionPlan` — props inférés, plans de coupe,
 * panels ennemis, dialogues ancrés, densité PNJ. Masquées dès qu'un plan
 * canonique existe (`canonicalProductionPlan`) pour ne garder qu'une seule
 * source de vérité dans l'UI.
 */
"use client";

import type { ChapterStudioData, EstimateCanonicalProductionPlan } from "@manga-ai-studio/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface LegacyMetricsCardProps {
  productionPlan: ChapterStudioData["productionPlan"];
  canonicalPlan: EstimateCanonicalProductionPlan | null | undefined;
}

export function LegacyMetricsCard({ productionPlan, canonicalPlan }: LegacyMetricsCardProps) {
  if (productionPlan?.premiumReadinessScore === undefined) return null;

  if (!canonicalPlan) {
    return (
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Auto-déductions narratives</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Ces informations sont inférées automatiquement par le backend — aucune configuration
            manuelle requise.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {productionPlan?.propCoverage?.covered &&
            productionPlan.propCoverage.covered.length > 0 ? (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Props inférés</p>
                <div className="flex flex-wrap gap-1">
                  {[...new Set(productionPlan.propCoverage.covered)].slice(0, 6).map((prop) => (
                    <span key={prop} className="rounded bg-muted/60 px-1.5 py-0.5 text-xs">
                      {prop}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {productionPlan?.cutawayCoverage ? (
              <div>
                <p className="text-xs text-muted-foreground">Plans de coupe prévus</p>
                <p className="font-semibold">{productionPlan.cutawayCoverage.count}</p>
              </div>
            ) : null}
            {productionPlan?.enemyCoverage ? (
              <div>
                <p className="text-xs text-muted-foreground">Panels focus ennemi</p>
                <p className="font-semibold">{productionPlan.enemyCoverage.panelCount}</p>
              </div>
            ) : null}
            {productionPlan?.dialogueAnchorCoverage ? (
              <div>
                <p className="text-xs text-muted-foreground">Dialogues ancrés</p>
                <p className="font-semibold">
                  {productionPlan.dialogueAnchorCoverage.anchored}
                </p>
              </div>
            ) : null}
            {productionPlan?.npcCoverage ? (
              <div>
                <p className="text-xs text-muted-foreground">Densité PNJ moy.</p>
                <p className="font-semibold">
                  {productionPlan.npcCoverage.avgNpcCount.toFixed(1)}
                </p>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <details className="rounded-xl border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">
        Debug — métriques legacy (non utilisées pour la génération premium)
      </summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {productionPlan?.cutawayCoverage ? (
          <span>Coupe (legacy) : {productionPlan.cutawayCoverage.count}</span>
        ) : null}
        {productionPlan?.npcCoverage ? (
          <span>
            PNJ moy. (legacy) : {productionPlan.npcCoverage.avgNpcCount.toFixed(1)}
          </span>
        ) : null}
      </div>
    </details>
  );
}
