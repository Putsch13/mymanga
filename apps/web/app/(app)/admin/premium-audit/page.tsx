import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  aggregatePremiumAuditStats,
  buildPremiumPlanAuditForChapter,
  type PremiumPlanAuditReport,
} from "@/lib/premium-audit/build-premium-plan-audit";

export const dynamic = "force-dynamic";

const RECENT_CHAPTERS_LIMIT = 30;

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-700/40 bg-emerald-900/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-700/40 bg-amber-900/10 text-amber-200"
        : tone === "bad"
          ? "border-red-700/40 bg-red-900/10 text-red-200"
          : "border-border/60 bg-card/40 text-foreground";
  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint ? <div className="mt-1 text-xs opacity-70">{hint}</div> : null}
    </div>
  );
}

function scoreTone(score: number): "good" | "warn" | "bad" {
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

export default async function PremiumAuditPage() {
  const user = await getCurrentUser();
  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const chapters = await prisma.chapter.findMany({
    orderBy: { updatedAt: "desc" },
    take: RECENT_CHAPTERS_LIMIT,
    select: {
      id: true,
      title: true,
      chapterNumber: true,
      status: true,
      updatedAt: true,
      project: { select: { id: true, title: true } },
    },
  });

  const reports = await Promise.all(
    chapters.map(async (c) => ({
      chapter: c,
      report: await buildPremiumPlanAuditForChapter(c.id).catch((err) => {
        console.warn("[admin/premium-audit] build_failed", c.id, err);
        return null as PremiumPlanAuditReport | null;
      }),
    })),
  );

  const stats = aggregatePremiumAuditStats(reports.map((r) => r.report));

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground">
              ← Retour admin
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Premium Plan Audit</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Vue temps quasi-réel sur la qualité des derniers chapitres
            générés. Score d&apos;adéquation contractuelle, couverture
            d&apos;intention, taux de blocage par étape pipeline.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Données calculées au chargement · {chapters.length} chapitres récents
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Chapitres analysés" value={stats.totalChapters} />
        <StatCard
          label="Score qualité moyen"
          value={`${stats.averageScore}/100`}
          tone={scoreTone(stats.averageScore)}
          hint="ContractualFocusAdequacy"
        />
        <StatCard
          label="Couverture intent moyenne"
          value={`${stats.averageIntentCoverage}/100`}
          tone={scoreTone(stats.averageIntentCoverage)}
        />
        <StatCard
          label="Ready-for-launch"
          value={`${stats.readyForLaunchCount}/${stats.totalChapters}`}
          tone={
            stats.totalChapters > 0 && stats.readyForLaunchCount / stats.totalChapters > 0.7
              ? "good"
              : "warn"
          }
        />
      </div>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle>Taux d&apos;échec par étape pipeline</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs uppercase text-muted-foreground">Plan canonique</div>
            <div className="mt-1 text-xl font-semibold">
              {stats.byStageFailureCount.canonicalPlan}
            </div>
            <div className="text-xs text-muted-foreground">
              chapitres sans blueprints
            </div>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs uppercase text-muted-foreground">Contract QA</div>
            <div className="mt-1 text-xl font-semibold">
              {stats.byStageFailureCount.contractQa}
            </div>
            <div className="text-xs text-muted-foreground">
              au moins un blocking
            </div>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs uppercase text-muted-foreground">Focus repair</div>
            <div className="mt-1 text-xl font-semibold">
              {stats.byStageFailureCount.focusRepair}
            </div>
            <div className="text-xs text-muted-foreground">
              repairable non vide
            </div>
          </div>
          <div className="rounded-lg border border-border/60 px-3 py-2">
            <div className="text-xs uppercase text-muted-foreground">Coverage visuelle</div>
            <div className="mt-1 text-xl font-semibold">
              {stats.byStageFailureCount.visualCoverage}
            </div>
            <div className="text-xs text-muted-foreground">
              weak location binding &gt; 0
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle>Derniers chapitres</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {reports.map(({ chapter, report }) => {
            if (!report) {
              return (
                <div
                  key={chapter.id}
                  className="rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2 text-amber-200"
                >
                  <div className="font-medium">
                    {chapter.project.title} · Ch.{chapter.chapterNumber} · {chapter.title}
                  </div>
                  <div className="text-xs opacity-70">audit indisponible</div>
                </div>
              );
            }
            const tone = scoreTone(report.score);
            const intentTone = scoreTone(report.intentCoverageScore);
            return (
              <Link
                key={chapter.id}
                href={`/projects/${chapter.project.id}/chapters/${chapter.id}/read`}
                className="block rounded-lg border border-border/60 bg-card/30 px-3 py-3 transition-colors hover:border-primary/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {chapter.project.title} · Ch.{chapter.chapterNumber} ·{" "}
                      {chapter.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {chapter.status} · {chapter.updatedAt.toISOString().slice(0, 16)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={tone === "good" ? "default" : "outline"}>
                      Score {report.score}/100
                    </Badge>
                    <Badge variant={intentTone === "good" ? "default" : "outline"}>
                      Intent {report.intentCoverageScore}/100
                    </Badge>
                    <Badge variant="outline">{report.panelCount} panels</Badge>
                    {report.readyForLaunch ? (
                      <Badge className="bg-emerald-700/30 text-emerald-100">ready</Badge>
                    ) : (
                      <Badge className="bg-red-800/30 text-red-100">blocked</Badge>
                    )}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground md:grid-cols-6">
                  <span>props: {report.propInserts}</span>
                  <span>weapons: {report.weaponInserts}</span>
                  <span>env: {report.envPanels}</span>
                  <span>npc: {report.npcPanels}</span>
                  <span>enemy: {report.enemyFocus}</span>
                  <span>weak loc: {report.weakLocationBinding}</span>
                </div>
                {report.blocking.length > 0 ? (
                  <div className="mt-2 rounded border border-red-700/40 bg-red-900/15 px-2 py-1 text-[11px] text-red-200">
                    blocking: {report.blocking.slice(0, 4).join(", ")}
                    {report.blocking.length > 4 ? ` (+${report.blocking.length - 4})` : ""}
                  </div>
                ) : null}
                {report.warnings.length > 0 ? (
                  <div className="mt-1 rounded border border-amber-700/40 bg-amber-900/10 px-2 py-1 text-[11px] text-amber-200">
                    warnings: {report.warnings.slice(0, 4).join(", ")}
                    {report.warnings.length > 4 ? ` (+${report.warnings.length - 4})` : ""}
                  </div>
                ) : null}
              </Link>
            );
          })}
          {reports.length === 0 ? (
            <p className="text-muted-foreground">Aucun chapitre récent à afficher.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
