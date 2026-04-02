import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Plus } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function MyMangasPage() {
  const user = await getCurrentUser();

  const projects = await prisma.project.findMany({
    where: { userId: user.id, status: { not: "archived" } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      chapters: { orderBy: { chapterNumber: "desc" }, take: 1 },
      _count: { select: { chapters: true, characters: true } },
    },
  });

  if (!projects) notFound();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mes mangas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reprends une histoire, lis le dernier chapitre, ou génère la suite.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/projects/new">
            <Plus className="h-4 w-4" />
            Nouveau manga
          </Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Aucun manga</CardTitle>
            <CardDescription>Crée ton premier univers et commence ton chapitre 1.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/projects/new">Créer mon premier manga</Link>
            </Button>
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
                      <Link href={`/projects/${p.id}`}>Ouvrir le studio</Link>
                    </Button>
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

