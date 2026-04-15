import type { ProductionPlan } from "@manga-ai-studio/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function PremiumScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "text-green-500" : pct >= 60 ? "text-yellow-500" : "text-red-500";
  return (
    <span className={`font-semibold tabular-nums ${color}`}>{pct}%</span>
  );
}

function RatioBadge({ ratio, label, warnAbove = 0.7 }: { ratio: number; label: string; warnAbove?: number }) {
  const pct = Math.round(ratio * 100);
  const color = ratio > warnAbove ? "text-red-500" : "text-green-500";
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={`font-semibold ${color}`}>{pct}%</p>
    </div>
  );
}

function isLegacyContract(plan: ProductionPlan | null | undefined): boolean {
  if (!plan) return true;
  const hasNoBlueprintsOrCoverage =
    (!Array.isArray(plan.panelBlueprints) || plan.panelBlueprints.length === 0) &&
    plan.premiumReadinessScore === undefined &&
    plan.focusDistribution === undefined;
  return hasNoBlueprintsOrCoverage;
}

export function ProductionPlanCard({ plan, productionOutlineSource }: {
  plan: ProductionPlan | null | undefined;
  productionOutlineSource?: string | null;
}) {
  const hasPremium =
    plan?.premiumReadinessScore !== undefined ||
    plan?.heroCenterRatio !== undefined ||
    plan?.focusDistribution !== undefined;

  const showLegacyWarning =
    process.env.NODE_ENV !== "production" &&
    (productionOutlineSource === "legacy_adapted" || isLegacyContract(plan));

  return (
    <Card className="border-border/60 bg-card/40">
      {showLegacyWarning && (
        <div className="rounded-t-lg border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 font-medium">
          ⚠ Legacy contract detected — regenerate premium contract
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Production Plan</span>
          {plan?.premiumReadinessScore !== undefined && (
            <span className="text-sm font-normal text-muted-foreground">
              Prêt à générer : <PremiumScoreBadge score={plan.premiumReadinessScore} />
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* Budget images */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Pages</p>
            <p>{plan?.pageCount ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Images estimées</p>
            <p>{plan?.estimatedImages ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Images cibles</p>
            <p>{plan?.targetImages ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Minimum</p>
            <p>{plan?.minimumImages ?? 55}</p>
          </div>
        </div>

        {/* Premium intelligence section */}
        {hasPremium && (
          <>
            <hr className="border-border/40" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Intelligence visuelle automatique
            </p>

            {/* Focus distribution */}
            <div className="grid gap-3 sm:grid-cols-3">
              {plan?.heroCenterRatio !== undefined && (
                <RatioBadge ratio={plan.heroCenterRatio} label="Ratio héros-centrique" warnAbove={0.7} />
              )}
              {plan?.cutawayCoverage && (
                <div>
                  <p className="text-muted-foreground">Plans de coupe</p>
                  <p className="font-semibold">
                    {plan.cutawayCoverage.count}{" "}
                    <span className="text-muted-foreground text-xs">
                      ({Math.round(plan.cutawayCoverage.ratio * 100)}%)
                    </span>
                  </p>
                </div>
              )}
              {plan?.enemyCoverage && (
                <div>
                  <p className="text-muted-foreground">Panels ennemi</p>
                  <p className="font-semibold">{plan.enemyCoverage.panelCount}</p>
                </div>
              )}
            </div>

            {/* Focus distribution breakdown */}
            {plan?.focusDistribution && Object.keys(plan.focusDistribution).length > 0 && (
              <div>
                <p className="text-muted-foreground mb-2">Répartition des focus</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(plan.focusDistribution).map(([focus, count]) => (
                    <span
                      key={focus}
                      className="rounded-md bg-muted/60 px-2 py-0.5 text-xs"
                    >
                      {focus}: <strong>{count as number}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Prop coverage */}
            {plan?.propCoverage && (
              <div>
                <p className="text-muted-foreground mb-1">Props inférés</p>
                {plan.propCoverage.covered.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(plan.propCoverage.covered)].map((prop) => (
                      <span key={prop} className="rounded-md bg-green-500/10 text-green-600 px-2 py-0.5 text-xs">
                        {prop}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">Aucun prop inféré</p>
                )}
                {plan.propCoverage.missing.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {plan.propCoverage.missing.map((msg, i) => (
                      <span key={i} className="rounded-md bg-red-500/10 text-red-600 px-2 py-0.5 text-xs">
                        ⚠ {msg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* NPC coverage */}
            {plan?.npcCoverage && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Panels PNJ</p>
                  <p className="font-semibold">{plan.npcCoverage.panelCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Densité PNJ moy.</p>
                  <p className="font-semibold">{plan.npcCoverage.avgNpcCount.toFixed(1)}</p>
                </div>
              </div>
            )}

            {/* Dialogue anchor coverage */}
            {plan?.dialogueAnchorCoverage && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Dialogues ancrés</p>
                  <p className="font-semibold text-green-500">{plan.dialogueAnchorCoverage.anchored}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Dialogues flottants</p>
                  <p className={`font-semibold ${plan.dialogueAnchorCoverage.floating > 0 ? "text-yellow-500" : "text-muted-foreground"}`}>
                    {plan.dialogueAnchorCoverage.floating}
                  </p>
                </div>
              </div>
            )}

            {/* Panel blueprints count */}
            {Array.isArray(plan?.panelBlueprints) && (
              <div>
                <p className="text-muted-foreground">Blueprints de panels</p>
                <p className="font-semibold">
                  {plan.panelBlueprints.length > 0 ? (
                    <span className="text-green-600">{plan.panelBlueprints.length} panels planifiés</span>
                  ) : (
                    <span className="text-yellow-500">0 — aucun blueprint généré</span>
                  )}
                </p>
              </div>
            )}
          </>
        )}

        {/* Compression risks */}
        <div>
          <p className="text-muted-foreground">Risques de compression</p>
          <ul className="mt-2 space-y-1">
            {(plan?.compressionRisks ?? []).length > 0 ? (
              plan?.compressionRisks.map((risk) => <li key={risk}>- {risk}</li>)
            ) : (
              <li>- Aucun risque majeur détecté</li>
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
