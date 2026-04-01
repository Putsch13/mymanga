import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
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
    include: {
      stylePacks: { take: 1, orderBy: { version: "desc" } },
      settings: true,
      _count: { select: { characters: true, chapters: true } },
    },
  });

  return (
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8 shadow-2xl shadow-violet-950/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Studio</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Bonjour, {user.displayName ?? user.email.split("@")[0]}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Pilote tes univers, tes personnages, tes chapitres et tes visuels depuis un studio manga pensé pour produire une serie premium cohérente.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline">{projects.length} projets actifs</Badge>
            <Badge variant="outline">{projects.reduce((sum, project) => sum + project._count.characters, 0)} personnages</Badge>
            <Badge variant="outline">{projects.reduce((sum, project) => sum + project._count.chapters, 0)} chapitres</Badge>
          </div>
        </div>
        <Button asChild size="lg" className="shrink-0 gap-2 shadow-lg shadow-violet-900/30">
          <Link href="/projects/new">
            <Plus className="h-4 w-4" />
            Nouveau projet
          </Link>
        </Button>
      </div>
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
              <Card className="h-full overflow-hidden border-border/60 bg-card/50 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-violet-950/20">
                <div className="h-28 bg-[linear-gradient(135deg,rgba(124,58,237,0.38),rgba(190,18,60,0.16)),radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_35%)]" />
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-tight group-hover:text-accent">{p.title}</CardTitle>
                    <Badge variant="secondary">{p.status}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2">{p.pitch ?? "Pas de pitch encore."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs text-muted-foreground">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span>Progression serie</span>
                      <span className="text-foreground">
                        {Math.min(100, p._count.chapters * 12 + p._count.characters * 6)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-background/80">
                      <div
                        className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-rose-500"
                        style={{ width: `${Math.min(100, p._count.chapters * 12 + p._count.characters * 6)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{p._count.characters} perso.</span>
                    <span>·</span>
                    <span>{p._count.chapters} chapitres</span>
                    {p.stylePacks[0] ? (
                      <>
                        <span>·</span>
                        <span>DA {p.stylePacks[0].renderFamily}</span>
                      </>
                    ) : null}
                    {p.settings ? (
                      <>
                        <span>·</span>
                        <span>Canon {p.settings.canonStrictness}/100</span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-accent">
                    Ouvrir le studio projet <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
