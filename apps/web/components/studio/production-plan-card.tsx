import type { EstimateCanonicalProductionPlan, ProductionPlan } from "@manga-ai-studio/core";
import { PREMIUM_PANEL_RANGE, PRODUCTION_RULES } from "@manga-ai-studio/core";
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

function metricNum(metrics: unknown, key: string): number | null {
  if (!metrics || typeof metrics !== "object") return null;
  const v = (metrics as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function ProductionPlanCard({ plan, productionOutlineSource, canonicalProductionPlan }: {
  plan: ProductionPlan | null | undefined;
  productionOutlineSource?: string | null;
  /** Quand présent (estimate), les compteurs affichés viennent du plan canonique — pas du plan brut. */
  canonicalProductionPlan?: EstimateCanonicalProductionPlan | null;
}) {
  const hasPremium =
    plan?.premiumReadinessScore !== undefined ||
    plan?.heroCenterRatio !== undefined ||
    plan?.focusDistribution !== undefined;

  const showLegacyWarning =
    process.env.NODE_ENV !== "production" &&
    (productionOutlineSource === "legacy_adapted" || isLegacyContract(plan));

  // P0.2 — bannière de statut contrat visuel explicite.
  // Règle : rouge si `panelBlueprints` absent/vide OU `panelBlueprints.length < minimumImages`,
  // vert si `panelBlueprints.length >= minimumImages`. La couleur "verte si > 0" de
  // l'ancienne version était trompeuse — le backend refuse le launch dans ce cas.
  const minimumImages =
    canonicalProductionPlan != null
      ? PRODUCTION_RULES.panelCount.minimum
      : (plan?.minimumImages ?? PREMIUM_PANEL_RANGE.min);
  const blueprintCount = Array.isArray(plan?.panelBlueprints) ? plan.panelBlueprints.length : 0;
  const canonicalPanels = canonicalProductionPlan?.panelCount ?? null;
  const canonicalPages = metricNum(canonicalProductionPlan?.metrics, "totalPages");
  const canonicalCutawayRatio = metricNum(canonicalProductionPlan?.metrics, "cutawayRatio");
  const canonicalActorDrivenRatio = metricNum(canonicalProductionPlan?.metrics, "actorDrivenRatio");
  const canonicalMaxConsecutiveCutaways = metricNum(canonicalProductionPlan?.metrics, "maxConsecutiveCutaways");
  const canonicalQaRaw =
    canonicalProductionPlan?.qa && typeof canonicalProductionPlan.qa === "object"
      ? (canonicalProductionPlan.qa as {
          valid?: boolean;
          errors?: string[];
          warnings?: string[];
        })
      : undefined;
  const canonicalQaValid = canonicalQaRaw?.valid;
  const canonicalQaErrors = Array.isArray(canonicalQaRaw?.errors) ? canonicalQaRaw.errors : [];
  const canonicalQaWarnings = Array.isArray(canonicalQaRaw?.warnings) ? canonicalQaRaw.warnings : [];
  const hasProductionPlan = Boolean(plan);
  const contractComplete = hasProductionPlan && blueprintCount >= minimumImages;
  const contractBannerTone: "danger" | "success" | null = !hasProductionPlan
    ? null
    : contractComplete
      ? "success"
      : "danger";
  const contractBannerMessage = !hasProductionPlan
    ? null
    : contractComplete
      ? `Contrat complet — ${blueprintCount} / ${minimumImages} blueprints`
      : blueprintCount === 0
        ? `Contrat incomplet — aucun blueprint (minimum requis ${minimumImages})`
        : `Contrat incomplet — ${blueprintCount} / ${minimumImages} blueprints`;

  return (
    <Card className="border-border/60 bg-card/40">
      {showLegacyWarning && (
        <div className="rounded-t-lg border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 font-medium">
          ⚠ Contrat hérité détecté — régénérez le plan de production
        </div>
      )}
      {contractBannerTone && contractBannerMessage ? (
        <div
          data-testid="production-plan-contract-banner"
          data-tone={contractBannerTone}
          className={
            contractBannerTone === "danger"
              ? "rounded-t-lg border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-600"
              : "rounded-t-lg border-b border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-600"
          }
        >
          {contractBannerTone === "danger" ? "⚠ " : "✓ "}
          {contractBannerMessage}
          {contractBannerTone === "danger" ? " — régénère le plan avant de lancer la génération." : null}
        </div>
      ) : null}
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
        {canonicalProductionPlan ? (
          <p className="text-xs text-muted-foreground">
            Métriques issues du <span className="font-medium text-foreground">plan canonique</span> (estimate) — alignées launch / QA.
          </p>
        ) : null}
        {/* Budget images : source canonique si disponible après estimate */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Pages</p>
            <p>{canonicalPages ?? plan?.pageCount ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Panels (canonique)</p>
            <p>{canonicalPanels ?? plan?.estimatedImages ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Images cibles</p>
            <p>
              {canonicalProductionPlan != null
                ? PRODUCTION_RULES.panelCount.target
                : (plan?.targetImages ?? 0)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Minimum garanti</p>
            <p>{minimumImages}</p>
          </div>
        </div>
        {canonicalProductionPlan ? (
          <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs space-y-1">
            <div>
              <span className="text-muted-foreground">Panels : </span>
              <span className="font-medium tabular-nums">{canonicalPanels ?? "—"}</span>
              <span className="text-muted-foreground"> / cible {PRODUCTION_RULES.panelCount.target}</span>
              <span className="text-muted-foreground"> · max {PRODUCTION_RULES.panelCount.maximum}</span>
            </div>
            {typeof canonicalCutawayRatio === "number" ? (
              <div>
                <span className="text-muted-foreground">Cutaways (ratio) : </span>
                <span className="font-medium tabular-nums">{(canonicalCutawayRatio * 100).toFixed(1)}%</span>
                <span className="text-muted-foreground"> · plafond {(PRODUCTION_RULES.cutaway.maxRatio * 100).toFixed(0)}%</span>
              </div>
            ) : null}
            {typeof canonicalActorDrivenRatio === "number" ? (
              <div>
                <span className="text-muted-foreground">Actor-driven : </span>
                <span className="font-medium tabular-nums">{(canonicalActorDrivenRatio * 100).toFixed(1)}%</span>
                <span className="text-muted-foreground"> · min {(PRODUCTION_RULES.actorDriven.minRatio * 100).toFixed(0)}%</span>
              </div>
            ) : null}
            {typeof canonicalMaxConsecutiveCutaways === "number" ? (
              <div>
                <span className="text-muted-foreground">Max cutaways consécutifs : </span>
                <span className="font-medium tabular-nums">{canonicalMaxConsecutiveCutaways}</span>
              </div>
            ) : null}
            {typeof canonicalQaValid === "boolean" ? (
              <div>
                <span className="text-muted-foreground">QA structure : </span>
                <span className={canonicalQaValid ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                  {canonicalQaValid ? "OK" : "Échec"}
                </span>
              </div>
            ) : null}
            {canonicalQaValid === false && canonicalQaErrors.length > 0 ? (
              <div className="mt-2 rounded border border-red-500/30 bg-red-500/5 px-2 py-1.5 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500">
                  Causes du rejet ({canonicalQaErrors.length})
                </p>
                <ul className="list-disc pl-4 space-y-0.5 text-xs text-red-600/90">
                  {canonicalQaErrors.slice(0, 6).map((msg, i) => (
                    <li key={`err_${i}`}>{msg}</li>
                  ))}
                  {canonicalQaErrors.length > 6 ? (
                    <li className="text-red-500/60">… et {canonicalQaErrors.length - 6} autre(s).</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            {canonicalQaValid === false && canonicalQaWarnings.length > 0 ? (
              <details className="mt-1 text-[11px] text-amber-600/80">
                <summary className="cursor-pointer">Avertissements QA ({canonicalQaWarnings.length})</summary>
                <ul className="list-disc pl-4 mt-1 space-y-0.5">
                  {canonicalQaWarnings.slice(0, 4).map((msg, i) => (
                    <li key={`warn_${i}`}>{msg}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="text-muted-foreground pt-1 border-t border-border/30">
              Source : <span className="font-medium text-foreground">CanonicalChapterProductionPlan</span>
            </p>
          </div>
        ) : null}

        {/* Premium intelligence — masquée si plan canonique (estimate) : évite deux jeux de métriques. */}
        {hasPremium && !canonicalProductionPlan && (
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

            {/* Panel blueprints count — rouge si < minimum, vert si >=, orange si vide */}
            {Array.isArray(plan?.panelBlueprints) && (
              <div>
                <p className="text-muted-foreground">Panels planifiés</p>
                <p className="font-semibold">
                  {plan.panelBlueprints.length === 0 ? (
                    <span className="text-red-600">0 / {minimumImages} — aucun blueprint généré</span>
                  ) : plan.panelBlueprints.length < minimumImages ? (
                    <span className="text-red-600">
                      {plan.panelBlueprints.length} / {minimumImages} — plan incomplet
                    </span>
                  ) : (
                    <span className="text-emerald-600">
                      {plan.panelBlueprints.length} / {minimumImages} — plan complet
                    </span>
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
