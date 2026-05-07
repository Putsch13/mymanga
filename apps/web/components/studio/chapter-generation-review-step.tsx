"use client";

import type { ChapterReadinessIssue } from "@manga-ai-studio/core";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PremiumReadinessDashboard } from "@/lib/readiness/build-premium-readiness-dashboard";
import { ChapterGenerateLauncher } from "./chapter-generate-launcher";
import { ChapterReviewBoard } from "./chapter-review-board";
import { PremiumReadinessDashboardCard } from "./premium-readiness-dashboard";
import { StudioInlineIssues } from "./studio-inline-issues";

function readVisualContractLaunchHints(snapshot: unknown): {
  rejectedCount: number;
  needsClarification: boolean;
} {
  if (!snapshot || typeof snapshot !== "object") return { rejectedCount: 0, needsClarification: false };
  const o = snapshot as Record<string, unknown>;
  const contract =
    o.contract && typeof o.contract === "object" && !Array.isArray(o.contract)
      ? (o.contract as Record<string, unknown>)
      : null;
  if (!contract) return { rejectedCount: 0, needsClarification: false };
  const rejected = Array.isArray(contract.rejectedOrUnrelated) ? contract.rejectedOrUnrelated.length : 0;
  return {
    rejectedCount: rejected,
    needsClarification: contract.needsClarification === true,
  };
}

export function ChapterGenerationReviewStep({
  projectId,
  chapterId,
  projectTitle,
  chapterTitle,
  blockerItems,
  warningItems,
  premiumDashboard,
  generatedImages,
  minimumImages,
  stackReady,
  stackBlockers,
  initialStats,
  canAccessReview,
  disabledMessage,
  onIssueAction,
  chapterVisualContract,
  onNavigateToPlan,
  preLaunchBlocked,
  sceneDialogueEnrichPreferred,
  onSceneDialogueEnrichPreferredChange,
  userIntent,
  heroCharacterId,
}: {
  projectId: string;
  chapterId: string;
  projectTitle: string;
  chapterTitle: string;
  /** User's free-text intent — used by the auto-repair "Analyser l'histoire" button. */
  userIntent?: string | null;
  /** Hero character id — used by the auto-repair "Compléter la fiche personnage" button. */
  heroCharacterId?: string | null;
  blockerItems: ChapterReadinessIssue[];
  warningItems: ChapterReadinessIssue[];
  premiumDashboard: PremiumReadinessDashboard | null;
  generatedImages: number;
  minimumImages: number;
  stackReady: boolean;
  stackBlockers: string[];
  initialStats: { total: number; completed: number; failed: number; pending: number } | null;
  canAccessReview: boolean;
  disabledMessage: string | null;
  onIssueAction: (issue: ChapterReadinessIssue) => void | Promise<void>;
  /** Snapshot issu du dernier run (GET studio) — avertissements avant lancement. */
  chapterVisualContract?: unknown;
  onNavigateToPlan?: () => void;
  /** Accuse de réception pré-lancement manquante (0 image + plan prêt). */
  preLaunchBlocked?: boolean;
  sceneDialogueEnrichPreferred?: boolean;
  onSceneDialogueEnrichPreferredChange?: (value: boolean) => void;
}) {
  const vcHints = readVisualContractLaunchHints(chapterVisualContract ?? null);
  const studioBlockers = blockerItems.length > 0 && generatedImages === 0;
  const premiumBlockers = (premiumDashboard?.status === "blocked" && generatedImages === 0) ?? false;
  const launchBlockedByReadiness = studioBlockers || premiumBlockers;
  const planReady = !studioBlockers;
  const premiumPlanReady = !premiumDashboard || premiumDashboard.status !== "blocked";
  const minimumReached = generatedImages >= minimumImages && minimumImages > 0;

  return (
    <div data-studio-section="generation_review" className="space-y-6">

      {/* Cockpit de statut lisible */}
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Prêt à générer ?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${planReady ? "border-green-500/30 bg-green-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
              {planReady
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                : <XCircle className="h-4 w-4 shrink-0 text-amber-400" />}
              <span className={planReady ? "text-green-200" : "text-amber-200"}>
                {planReady ? "Studio (brief / plan)" : "Studio à corriger"}
              </span>
            </div>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${premiumPlanReady ? "border-green-500/30 bg-green-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
              {premiumPlanReady
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                : <XCircle className="h-4 w-4 shrink-0 text-amber-400" />}
              <span className={premiumPlanReady ? "text-green-200" : "text-amber-200"}>
                {premiumPlanReady ? "Contrats premium OK" : "Contrats premium"}
              </span>
            </div>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${stackReady ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
              {stackReady
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                : <XCircle className="h-4 w-4 shrink-0 text-red-400" />}
              <span className={stackReady ? "text-green-200" : "text-red-200"}>
                {stackReady ? "Stack prête" : "Stack bloquée"}
              </span>
            </div>
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${minimumReached ? "border-green-500/30 bg-green-500/10" : "border-border/60 bg-background/30"}`}>
              {minimumReached
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                : <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className={minimumReached ? "text-green-200" : "text-muted-foreground"}>
                {minimumReached ? "Minimum atteint" : `${generatedImages}/${minimumImages} images`}
              </span>
            </div>
          </div>

          {launchBlockedByReadiness && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100 text-xs space-y-1">
              <p className="font-medium">Le chapitre ne peut pas être lancé tant que des points bloquants existent.</p>
              <p>Retourne dans les étapes précédentes pour corriger les problèmes listés ci-dessous.</p>
            </div>
          )}
          {!stackReady && stackBlockers.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-100 text-xs space-y-1">
              <p className="font-medium">La stack IA n&apos;est pas prête : configure les dépendances manquantes.</p>
              <ul className="space-y-0.5 pl-3">
                {stackBlockers.map((b) => <li key={b}>· {b}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <PremiumReadinessDashboardCard
        dashboard={premiumDashboard}
        projectId={projectId}
        chapterId={chapterId}
        userIntent={userIntent}
        heroCharacterId={heroCharacterId}
      />

      {/* Blocants détaillés avec CTA "Corriger" */}
      {blockerItems.length > 0 && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-200">
              <XCircle className="h-4 w-4" />
              Pourquoi la génération est bloquée ?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {blockerItems.map((issue, i) => (
              <div key={i} className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                <div>
                  <p className="font-medium text-amber-100">{issue.message}</p>
                  {issue.ctaLabel && <p className="mt-0.5 text-xs text-amber-300/80">{issue.ctaLabel}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-amber-500/30 text-amber-200 hover:bg-amber-500/20"
                  onClick={() => void onIssueAction(issue)}
                >
                  Corriger maintenant
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {warningItems.length > 0 ? (
        <StudioInlineIssues title="Points à surveiller" issues={warningItems} tone="neutral" onAction={onIssueAction} testIdPrefix={null} />
      ) : null}

      {(vcHints.needsClarification || vcHints.rejectedCount > 0) && (
        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              Contrat visuel du chapitre
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-amber-50/95">
            {vcHints.needsClarification ? (
              <p>
                Le lieu principal reste <strong>ambigu</strong> pour l&apos;extraction IA. Précise le décor dans
                l&apos;intent ou les beats avant de lancer, ou continue si tu assumes le flou.
              </p>
            ) : null}
            {vcHints.rejectedCount > 0 ? (
              <p>
                {vcHints.rejectedCount} élément{vcHints.rejectedCount > 1 ? "s ont été" : " a été"} classé
                {vcHints.rejectedCount > 1 ? "s" : ""} <strong>hors chapitre</strong> par le contrat visuel (ancien contexte
                ou inférence trop large). Ils ne sont <strong>pas</strong> imposés comme obligations de rendu.
              </p>
            ) : null}
            <p className="text-xs text-amber-200/80">
              Par défaut le pipeline <strong>ne bloque pas</strong> sur ces entrées : tu peux lancer tel quel. Pour
              ajuster le texte ou l&apos;outline, retourne au plan.
            </p>
            {onNavigateToPlan ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-400/40 text-amber-100 hover:bg-amber-500/15"
                  onClick={() => onNavigateToPlan()}
                >
                  Retour au plan du chapitre
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 bg-card/40" data-studio-field="studio-chapter-generation-launcher">
        <CardHeader>
          <CardTitle className="text-base">Lancer la génération</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {typeof onSceneDialogueEnrichPreferredChange === "function" ? (
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-background/40 px-3 py-3">
              <div className="space-y-1 pr-2">
                <Label htmlFor="scene-dialogue-enrich" className="text-sm font-medium leading-tight">
                  Dialoguiste scène (OpenAI)
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Complète les cases « speaker » encore sans réplique après le plan. Nécessite{" "}
                  <code className="rounded bg-muted px-1">OPENAI_API_KEY</code> sur le serveur. Tu peux aussi activer
                  globalement <code className="rounded bg-muted px-1">OPENAI_SCENE_DIALOGUE_ENRICH=1</code>.
                </p>
              </div>
              <Switch
                id="scene-dialogue-enrich"
                checked={Boolean(sceneDialogueEnrichPreferred)}
                onCheckedChange={(v) => onSceneDialogueEnrichPreferredChange(v)}
                data-testid="studio-scene-dialogue-enrich"
              />
            </div>
          ) : null}
          <ChapterGenerateLauncher
            projectId={projectId}
            chapterId={chapterId}
            initialStats={initialStats}
            disabled={launchBlockedByReadiness || !stackReady || Boolean(preLaunchBlocked)}
            disabledMessage={
              preLaunchBlocked
                ? "Confirme d’abord le contrat visuel en haut du studio (bouton « J’ai vérifié — débloquer le lancement »)."
                : launchBlockedByReadiness
                  ? `${blockerItems.length} point${blockerItems.length > 1 ? "s" : ""} bloquant${blockerItems.length > 1 ? "s" : ""} à corriger avant de lancer`
                  : !stackReady
                    ? "La stack IA n'est pas prête"
                    : disabledMessage
            }
            stackBlockers={stackBlockers}
          />
        </CardContent>
      </Card>

      {canAccessReview ? (
        <ChapterReviewBoard projectId={projectId} chapterId={chapterId} chapterTitle={chapterTitle} projectTitle={projectTitle} />
      ) : (
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Review</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            La review apparaîtra ici dès qu&apos;un premier lot d&apos;images existera ou qu&apos;un statut QA sera atteint.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
