import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, LibraryBig, Plus, Wand2 } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";

export const dynamic = "force-dynamic";

export default async function MyMangasPage() {
  const user = await getCurrentUser();

  let projects: Array<{
    id: string;
    title: string;
    pitch: string | null;
    status: string;
    chapters: Array<{ id: string; chapterNumber: number; status: string }>;
    _count: { chapters: number; characters: number };
  }> = [];

  try {
    projects = await prisma.project.findMany({
      where: { userId: user.id, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        chapters: { orderBy: { chapterNumber: "desc" }, take: 1 },
        _count: { select: { chapters: true, characters: true } },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isMigration =
      msg.includes("column") || msg.includes("does not exist") ||
      msg.includes("P2022") || msg.includes("Unknown field");
    console.error("[mangas-page] db error:", msg);
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-lg font-medium">
          {isMigration ? "Mise à jour de la base de données en cours." : "Erreur de chargement de la bibliothèque."}
        </p>
        <p className="text-sm text-muted-foreground max-w-md">Réessaie dans quelques instants.</p>
        <Button asChild><Link href="/dashboard">Retour au dashboard</Link></Button>
      </div>
    );
  }

  if (!projects) notFound();

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Bibliothèque utilisateur</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reprends une histoire, relance la génération d&apos;une suite, ou retourne au labo pour enrichir personnages, style manga et rendu.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/lab">
              <Wand2 className="h-4 w-4" />
              Ouvrir le labo
            </Link>
          </Button>
          <Button asChild className="gap-2">
            <Link href="/projects/new">
              <Plus className="h-4 w-4" />
              Nouveau manga
            </Link>
          </Button>
        </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LibraryBig className="h-5 w-5 text-accent" />
              Aucun manga
            </CardTitle>
            <CardDescription>Crée ton premier univers dans le labo, puis lance un vrai chapitre 1.</CardDescription>
          </CardHeader>
          <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/projects/new">Créer mon premier manga</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/lab">Découvrir le labo</Link>
                </Button>
              </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const last = p.chapters[0];
            const lastLink = last
              ? `/projects/${p.id}/chapters/${last.id}/read`
              : `/projects/${p.id}/generate`;
            const actionLabel = last ? "Continuer la lecture" : "Générer le chapitre 1";

            return (
              <Card key={p.id} className="border-border/60 bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-tight">{p.title}</CardTitle>
                    <Badge variant="secondary">{p.status}</Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {p.pitch ?? "Pas de pitch encore."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{p._count.chapters} chapitres</Badge>
                    <Badge variant="outline">{p._count.characters} persos</Badge>
                    {last ? (
                      <Badge variant="outline">
                        Dernier : #{last.chapterNumber}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button asChild className="gap-2">
                      <Link href={lastLink}>
                        <BookOpen className="h-4 w-4" />
                        {actionLabel}
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/projects/${p.id}/generate`}>Générer la suite</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/projects/${p.id}`}>Ouvrir le studio</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/projects/${p.id}/characters`}>Personnages</Link>
                    </Button>
                    <DeleteProjectButton projectId={p.id} projectTitle={p.title} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

