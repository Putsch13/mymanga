import Link from "next/link";
import { Coins, LibraryBig, Plus, Sparkles, UserRound, Wand2 } from "lucide-react";
import { prisma, type Prisma } from "@manga-ai-studio/db";
import { getCurrentUser, isUnlimitedAdminEmail } from "@/lib/auth/get-app-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MangaProjectCard } from "@/components/projects/manga-project-card";

export const dynamic = "force-dynamic";

function getCoverUrl(project: {
  chapters: Array<{
    scenes: Array<{
      images: Array<{ persistedUrl: string | null; imageUrl: string | null }>;
    }>;
  }>;
}): string | null {
  const firstImage = project.chapters[0]?.scenes[0]?.images[0];
  return firstImage?.persistedUrl ?? firstImage?.imageUrl ?? null;
}

type DashboardProject = Prisma.ProjectGetPayload<{
  include: {
    stylePacks: true;
    settings: true;
    chapters: {
      include: {
        scenes: {
          include: {
            images: { select: { persistedUrl: true; imageUrl: true } };
          };
        };
      };
    };
    _count: { select: { characters: true; chapters: true } };
  };
}>;

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const unlimitedAdmin = isUnlimitedAdminEmail(user.email);

  let projects: DashboardProject[] = [];
  let wallet: { balance: number } | null = null;

  try {
    [projects, wallet] = await Promise.all([
      prisma.project.findMany({
        where: { userId: user.id, status: { not: "archived" } },
        orderBy: { updatedAt: "desc" },
        take: 24,
        include: {
          stylePacks: { take: 1, orderBy: { version: "desc" } },
          settings: true,
          chapters: {
            orderBy: { chapterNumber: "asc" },
            take: 1,
            include: {
              scenes: {
                take: 1,
                orderBy: { sceneNumber: "asc" },
                include: {
                  images: {
                    where: { status: "completed" },
                    take: 1,
                    orderBy: { panelNumber: "asc" },
                    select: { persistedUrl: true, imageUrl: true },
                  },
                },
              },
            },
          },
          _count: { select: { characters: true, chapters: true } },
        },
      }),
      prisma.wallet.findUnique({ where: { userId: user.id } }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isMigration =
      msg.includes("column") ||
      msg.includes("does not exist") ||
      msg.includes("P2022") ||
      msg.includes("Unknown field");
    console.error("[dashboard] db error:", msg);
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-lg font-medium">
          {isMigration ? "Mise à jour de la base de données en cours." : "Erreur de chargement du tableau de bord."}
        </p>
        <p className="text-sm text-muted-foreground max-w-md">
          {isMigration
            ? "Lance npx prisma migrate deploy sur l'environnement de production puis redémarre le serveur."
            : "Réessaie dans quelques instants."}
        </p>
        <div className="mt-4 flex gap-3">
          <Button asChild><Link href="/projects/new">Nouveau manga</Link></Button>
          <Button variant="outline" asChild><Link href="/lab">Labo</Link></Button>
        </div>
      </div>
    );
  }

  const totalChapters = projects.reduce((sum, p) => sum + p._count.chapters, 0);
  const totalCharacters = projects.reduce((sum, p) => sum + p._count.characters, 0);

  return (
    <div className="space-y-8">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8 shadow-2xl shadow-violet-950/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Dashboard</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight">
              Bonjour, {user.displayName ?? user.email.split("@")[0]}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">{projects.length} mangas</Badge>
              <Badge variant="outline">{totalCharacters} personnages</Badge>
              <Badge variant="outline">{totalChapters} chapitres</Badge>
              <Badge variant="outline">
                {unlimitedAdmin ? "crédits illimités" : `${wallet?.balance ?? 0} crédits`}
              </Badge>
              {unlimitedAdmin && <Badge className="bg-emerald-950/40 text-emerald-300">admin illimité</Badge>}
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
                Labo
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Navigation rapide */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/mangas" className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-accent/30 hover:bg-accent/5 hover:shadow-lg hover:shadow-violet-900/10">
          <LibraryBig className="h-5 w-5 text-violet-300 transition-transform duration-200 group-hover:scale-110" />
          <p className="mt-3 text-sm font-medium">Bibliothèque</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Tous mes mangas</p>
        </Link>
        <Link href="/lab" className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-accent/30 hover:bg-accent/5 hover:shadow-lg hover:shadow-violet-900/10">
          <Wand2 className="h-5 w-5 text-violet-300 transition-transform duration-200 group-hover:scale-110" />
          <p className="mt-3 text-sm font-medium">Labo</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Style, DA, génération</p>
        </Link>
        <Link href="/account" className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-accent/30 hover:bg-accent/5 hover:shadow-lg hover:shadow-violet-900/10">
          <UserRound className="h-5 w-5 text-violet-300 transition-transform duration-200 group-hover:scale-110" />
          <p className="mt-3 text-sm font-medium">Mon compte</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Accès et paramètres</p>
        </Link>
        <Link href="/wallet" className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-accent/30 hover:bg-accent/5 hover:shadow-lg hover:shadow-violet-900/10">
          <Coins className="h-5 w-5 text-violet-300 transition-transform duration-200 group-hover:scale-110" />
          <p className="mt-3 text-sm font-medium">Crédits</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unlimitedAdmin ? "Illimité" : `${wallet?.balance ?? 0} disponibles`}
          </p>
        </Link>
      </div>

      {/* Grid projets */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mes mangas</h2>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/projects/new">
              <Plus className="h-3.5 w-3.5" />
              Nouveau
            </Link>
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-accent" />
                Aucun projet pour l&apos;instant
              </CardTitle>
              <CardDescription>
                Crée un univers, définis ton style pack, puis enchaîne chapitres et illustrations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/projects/new">Créer mon premier manga</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {projects.map((p) => (
              <MangaProjectCard
                key={p.id}
                project={{
                  id: p.id,
                  title: p.title,
                  slug: p.slug,
                  primaryGenre: p.primaryGenre,
                  contentRating: p.contentRating,
                  status: p.status,
                  _count: p._count,
                  chapters: p.chapters.map((ch) => ({
                    id: ch.id,
                    chapterNumber: ch.chapterNumber,
                    status: ch.status,
                  })),
                }}
                coverImageUrl={getCoverUrl(p)}
              />
            ))}
            {/* Card "Nouveau manga" */}
            <Link
              href="/projects/new"
              className="flex aspect-[3/4] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/50 bg-card/30 text-muted-foreground transition hover:border-accent/40 hover:text-accent"
            >
              <Plus className="h-8 w-8" />
              <span className="text-xs font-medium">Nouveau manga</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
