import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const projects = await prisma.project.findMany({
    where: { userId: user.id, status: { not: "archived" } },
    orderBy: { updatedAt: "desc" },
    take: 24,
    include: { stylePacks: { take: 1, orderBy: { version: "desc" } }, _count: { select: { characters: true, chapters: true } } },
  });

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Studio</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Bonjour, {user.displayName ?? user.email.split("@")[0]}</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Univers cohérents, routage multi-provider (FLUX, Runware, Stability), style packs et canon — taillé pour une DA manga premium.
          </p>
        </div>
        <Button asChild size="lg" className="shrink-0 gap-2 shadow-lg shadow-violet-900/30">
          <Link href="/projects/new">
            <Plus className="h-4 w-4" />
            Nouveau projet
          </Link>
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {projects.length === 0 ? (
          <Card className="border-dashed border-border/60 bg-card/40 md:col-span-2 xl:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-accent" />
                Aucun projet pour l’instant
              </CardTitle>
              <CardDescription>Crée un univers, définis ton style pack, puis enchaîne chapitres et illustrations.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/projects/new">Créer mon premier projet</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="group block">
              <Card className="h-full border-border/60 bg-card/50 transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-violet-950/20">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-tight group-hover:text-accent">{p.title}</CardTitle>
                    <Badge variant="secondary">{p.status}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2">{p.pitch ?? "Pas de pitch encore."}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  <span>{p._count.characters} perso.</span>
                  <span className="mx-2">·</span>
                  <span>{p._count.chapters} chapitres</span>
                  {p.stylePacks[0] ? (
                    <>
                      <span className="mx-2">·</span>
                      <span>DA {p.stylePacks[0].renderFamily}</span>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
