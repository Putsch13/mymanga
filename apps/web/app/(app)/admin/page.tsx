import { redirect } from "next/navigation";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (user.role !== "admin") {
    redirect("/dashboard");
  }

  const [users, projects, orders, moderationEvents, transactions] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.project.findMany({ orderBy: { updatedAt: "desc" }, take: 12 }),
    prisma.stripeOrder.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.moderationEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.walletTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold">Admin backoffice</h1>
        <p className="mt-2 text-sm text-muted-foreground">Vue minimaliste V3 : users, projets, orders Stripe, modération et ledger.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
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
