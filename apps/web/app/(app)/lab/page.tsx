import Link from "next/link";
import { Wand2, ArrowRight, BookOpen, Coins } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  const user = await getCurrentUser();
  const [projects, wallet] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        chapters: { orderBy: { chapterNumber: "desc" }, take: 1 },
        _count: { select: { chapters: true, characters: true } },
      },
    }),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
  ]);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8 shadow-2xl shadow-violet-950/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.14),transparent_24%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge>Labo de génération</Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Créer un nouveau chapitre sans te perdre dans le studio.</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Ici, tu lances rapidement la suite d&apos;un manga existant ou tu démarres un nouveau projet. L&apos;objectif produit est simple :
              idée, génération, lecture, puis reprise de série.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-border/60 bg-card/50">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
                  <Coins className="h-5 w-5 text-accent" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Crédits dispo</p>
                  <p className="text-2xl font-semibold">{wallet?.balance ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="flex items-center gap-3 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10">
                  <Wand2 className="h-5 w-5 text-violet-300" />
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">Promesse</p>
                  <p className="text-sm font-medium">Environ 6 pages par chapitre, lecture manga-first.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Démarrer un nouveau manga</CardTitle>
            <CardDescription>Crée l&apos;univers, puis lance directement ton premier chapitre.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full gap-2">
              <Link href="/projects/new">
                Nouveau projet <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="text-sm text-muted-foreground">Les nouveaux comptes démarrent avec des crédits de bienvenue pour tester un vrai premier chapitre.</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Reprendre une série existante</CardTitle>
            <CardDescription>Choisis un manga et relance la machine sans passer par toute l&apos;arborescence projet.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {projects.length > 0 ? (
              projects.map((project) => {
                const last = project.chapters[0];
                return (
                  <div key={project.id} className="rounded-2xl border border-border/60 bg-background/30 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{project.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{project._count.chapters} chapitres · {project._count.characters} persos</p>
                      </div>
                      <Badge variant="outline">{project.status}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild size="sm" className="gap-2">
                        <Link href={`/projects/${project.id}/generate`}>
                          <Wand2 className="h-4 w-4" />
                          Générer
                        </Link>
                      </Button>
                      {last ? (
                        <Button asChild size="sm" variant="outline" className="gap-2">
                          <Link href={`/projects/${project.id}/chapters/${last.id}/read`}>
                            <BookOpen className="h-4 w-4" />
                            Lire
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">Aucun projet pour l&apos;instant.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

