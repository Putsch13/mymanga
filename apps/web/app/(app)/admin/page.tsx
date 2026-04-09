import { redirect } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGenerationStackStatus } from "@/lib/generation/stack-readiness";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const stack = getGenerationStackStatus();
  const [users, projects, orders, moderationEvents, transactions, chapters, failedSceneImages] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.project.findMany({ orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.stripeOrder.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.moderationEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.walletTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.chapter.findMany({
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        title: true,
        chapterNumber: true,
        status: true,
        updatedAt: true,
        outline: true,
        project: {
          select: {
            title: true,
          },
        },
      },
    }),
    prisma.sceneImage.findMany({
      where: { status: { in: ["failed", "blocked"] } },
      orderBy: { id: "desc" },
      take: 8,
      select: {
        id: true,
        status: true,
        provider: true,
        model: true,
        metadata: true,
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Admin backoffice</h1>
        <p className="mt-2 text-sm text-muted-foreground">Vue admin V5 : stack, qualité premium, fallbacks visibles, jobs, modération et activité produit.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Stack génération</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <span>Statut</span>
              <span className="text-muted-foreground">{stack.operationalStatus}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <span>Modes dégradés</span>
              <span className="text-muted-foreground">{stack.degradedModes.length}</span>
            </div>
            <div className="rounded-lg border border-border/60 px-3 py-2 text-muted-foreground">
              {stack.degradedModes.length > 0
                ? stack.degradedModes.join(", ")
                : "Aucun fallback majeur détecté sur la stack."}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Chapitres premium récents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {chapters.map((entry) => {
              const outline = asRecord(entry.outline);
              const quality = asRecord(outline.qualityReport);
              const degradedModes = Array.isArray(outline.degradedModes) ? outline.degradedModes.length : 0;
              const score =
                typeof quality.averageReleaseScore === "number"
                  ? `${Math.round(quality.averageReleaseScore * 100)}/100`
                  : "n/a";
              return (
                <div key={entry.id} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span>{entry.project.title} · Ch.{entry.chapterNumber} · {entry.title}</span>
                    <span className="text-muted-foreground">{entry.status}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Release score {score}</span>
                    <span>Fallbacks {degradedModes}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Derniers utilisateurs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {users.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span>{entry.email}</span>
                <span className="text-muted-foreground">{entry.role}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Derniers projets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {projects.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span>{entry.title}</span>
                <span className="text-muted-foreground">{entry.status}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Orders Stripe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {orders.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span>{entry.packCode}</span>
                <span className="text-muted-foreground">{entry.status}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Ledger transactions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {transactions.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span>{entry.reason}</span>
                <span className="text-muted-foreground">
                  {entry.type} {entry.amount}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle>Images en échec / bloquées</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {failedSceneImages.length > 0 ? (
            failedSceneImages.map((entry) => {
              const metadata = asRecord(entry.metadata);
              return (
                <div key={entry.id} className="rounded-lg border border-border/60 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span>{entry.provider ?? "n/a"} · {entry.model ?? "n/a"}</span>
                    <span className="text-muted-foreground">{entry.status}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {String(metadata.error ?? metadata.blockedReason ?? "Aucune erreur détaillée")}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-muted-foreground">Aucun échec image récent.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle>Événements de modération</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {moderationEvents.length > 0 ? (
            moderationEvents.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span>{entry.sourceType}</span>
                <span className="text-muted-foreground">{entry.decision}</span>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">Aucun événement de modération pour le moment.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
