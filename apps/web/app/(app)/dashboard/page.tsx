import Link from "next/link";
import { ArrowRight, BookOpen, Coins, LibraryBig, Plus, Sparkles, Wand2 } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const [projects, wallet] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 24,
      include: {
        stylePacks: { take: 1, orderBy: { version: "desc" } },
        settings: true,
        chapters: { orderBy: { chapterNumber: "desc" }, take: 1 },
        _count: { select: { characters: true, chapters: true } },
      },
    }),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
  ]);

  const latestProject = projects[0];
  const latestChapter = latestProject?.chapters[0];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8 shadow-2xl shadow-violet-950/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Accueil créateur</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight">Bonjour, {user.displayName ?? user.email.split("@")[0]}</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Ton objectif ici : lancer un chapitre vite, le lire comme un manga, puis donner envie de continuer avec des crédits.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">{projects.length} mangas actifs</Badge>
              <Badge variant="outline">{projects.reduce((sum, project) => sum + project._count.characters, 0)} personnages</Badge>
              <Badge variant="outline">{projects.reduce((sum, project) => sum + project._count.chapters, 0)} chapitres</Badge>
              <Badge variant="outline">{wallet?.balance ?? 0} crédits</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" className="gap-2 shadow-lg shadow-violet-900/30">
              <Link href="/projects/new">
                <Plus className="h-4 w-4" />
                Nouveau manga
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link href="/lab">
                <Wand2 className="h-4 w-4" />
                Ouvrir le labo
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Ton prochain meilleur clic</CardTitle>
            <CardDescription>Une action claire pour reprendre la boucle créer → générer → lire.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Link href="/mangas" className="rounded-2xl border border-border/60 bg-background/30 p-4 transition hover:border-accent/40">
              <LibraryBig className="h-5 w-5 text-violet-300" />
              <p className="mt-3 font-medium">Ma bibliothèque</p>
              <p className="mt-1 text-sm text-muted-foreground">Retrouver mes mangas et reprendre ma lecture.</p>
            </Link>
            <Link href={latestProject ? `/projects/${latestProject.id}/generate` : "/projects/new"} className="rounded-2xl border border-border/60 bg-background/30 p-4 transition hover:border-accent/40">
              <Wand2 className="h-5 w-5 text-rose-300" />
              <p className="mt-3 font-medium">Générer un chapitre</p>
              <p className="mt-1 text-sm text-muted-foreground">Objectif produit : environ 6 pages manga par chapitre.</p>
            </Link>
            <Link href={latestChapter ? `/projects/${latestProject?.id}/chapters/${latestChapter.id}/read` : "/wallet"} className="rounded-2xl border border-border/60 bg-background/30 p-4 transition hover:border-accent/40">
              {latestChapter ? <BookOpen className="h-5 w-5 text-accent" /> : <Coins className="h-5 w-5 text-amber-300" />}
              <p className="mt-3 font-medium">{latestChapter ? "Continuer à lire" : "Gérer mes crédits"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {latestChapter ? "Relancer immédiatement l’expérience lecteur manga." : "Voir le solde et préparer l’upsell crédits."}
              </p>
            </Link>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Crédits de bienvenue</CardTitle>
            <CardDescription>Le compte démarre avec une réserve pour créer un premier chapitre convaincant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
              <p className="text-xs text-muted-foreground">Solde actuel</p>
              <p className="mt-1 text-3xl font-semibold">{wallet?.balance ?? 0}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Tant que l’utilisateur a des crédits, l’expérience doit lui donner envie de lancer son premier vrai chapitre, puis de revenir pour acheter la suite.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/wallet">Voir les crédits</Link>
            </Button>
          </CardContent>
        </Card>
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
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Studio</Badge>
                    <Badge variant="outline">{p.chapters[0] ? "Prêt à lire" : "Prêt à lancer"}</Badge>
                  </div>
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
                  <div className="flex items-center gap-2 text-accent">Ouvrir le studio projet <ArrowRight className="h-3 w-3" /></div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
