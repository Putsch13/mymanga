import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpen, Coins, Palette, Users, Wand2 } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser, isUnlimitedAdminEmail } from "@/lib/auth/get-app-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  const user = await getCurrentUser();
  const unlimitedAdmin = isUnlimitedAdminEmail(user.email);
  const [projects, wallet] = await Promise.all([
    prisma.project.findMany({
      where: { userId: user.id, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        chapters: { orderBy: { chapterNumber: "desc" }, take: 1 },
        stylePacks: { orderBy: { version: "desc" }, take: 1 },
        settings: true,
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
            <Badge>Labo V4</Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Le centre de création : personnages, style manga, rendu, garde-fous et génération.</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              C&apos;est ici que tu configures le physique, la personnalité, les antagonistes, le style graphique, l&apos;intensité narrative et la logique de
              lecture. Une fois validé, le chapitre est généré, persisté et réinjecté dans la mémoire du projet pour les suites.
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
                  <p className="text-2xl font-semibold">{unlimitedAdmin ? "Illimité" : wallet?.balance ?? 0}</p>
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
                  <p className="text-sm font-medium">Lecture manga RTL, génération multi-IA, mémoire et canon projet.</p>
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
            <CardDescription>Le labo prend le relais dès que l&apos;univers de base est créé.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full gap-2">
              <Link href="/projects/new">
                Nouveau projet <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <div className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Checklist V4 du labo</p>
              <p className="mt-2">1. Créer l&apos;univers.</p>
              <p>2. Définir héros, antagonistes et secondaires.</p>
              <p>3. Régler le style manga, la DA et l&apos;intensité.</p>
              <p>4. Lancer le premier chapitre et stocker sa mémoire.</p>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 text-sm text-amber-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Les contenus `18+` doivent être explicitement marqués et validés. Le labo V4 centralise ce disclaimer pour éviter les incohérences de
                  génération.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Reprendre une série existante</CardTitle>
            <CardDescription>Choisis un projet et travaille tout depuis le labo : personnages, style, bible, génération et lecture.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {projects.length > 0 ? (
              projects.map((project) => {
                const last = project.chapters[0];
                return (
                  <div key={project.id} className="rounded-2xl border border-border/60 bg-background/30 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{project.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {project._count.chapters} chapitres · {project._count.characters} persos · DA {project.stylePacks[0]?.renderFamily ?? "à définir"}
                        </p>
                      </div>
                      <Badge variant="outline">{project.status}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">Canon {project.settings?.canonStrictness ?? 85}/100</Badge>
                      <Badge variant="outline">Dialogue {project.settings?.dialogueDensity ?? 55}/100</Badge>
                      <Badge variant="outline">{project.intensityLayer}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline" className="gap-2">
                        <Link href={`/projects/${project.id}/characters`}>
                          <Users className="h-4 w-4" />
                          Personnages
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="gap-2">
                        <Link href={`/projects/${project.id}/style`}>
                          <Palette className="h-4 w-4" />
                          Style manga
                        </Link>
                      </Button>
                      <Button asChild size="sm" className="gap-2">
                        <Link href={`/projects/${project.id}/pipeline`}>
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
                      <Button asChild size="sm" variant="outline" className="gap-2">
                        <Link href={`/projects/${project.id}`}>
                          Studio projet
                        </Link>
                      </Button>
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

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-lg">Physique & personnalité</CardTitle>
            <CardDescription>Créer les héros, méchants et secondaires avec voix, corps, canon et tenue.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Le labo renvoie vers le configurateur avancé de personnages pour construire une vraie base de cohérence inter-chapitres.
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-lg">Style manga & rendu</CardTitle>
            <CardDescription>Genre, ligne, ombrage, format, intensité et rendu dessin.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Le style du manga et la DA ne doivent plus être dispersés. Le labo agit comme un studio central.
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-lg">Mémoire & suite</CardTitle>
            <CardDescription>Chaque chapitre validé enrichit la mémoire et prépare les suivants.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Résumés, canon, état des personnages et boucles ouvertes doivent alimenter les chapitres 2, 3 et suivants.
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

