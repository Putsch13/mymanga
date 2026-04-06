import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function CharactersPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  let project;
  try {
    project = await prisma.project.findFirst({
      where: { id, userId: user.id },
      include: {
        characters: {
          orderBy: { createdAt: "desc" },
          include: { visualRefs: { where: { isPrimary: true }, take: 1 } },
        },
        relationships: true,
      },
    });
  } catch (e) {
    console.error("[characters-page] DB error:", e instanceof Error ? e.message : e);
    return (
      <div className="space-y-4 p-6">
        <p className="text-red-400 text-sm">Erreur de chargement des personnages. La base de donnees necessite une migration.</p>
        <p className="text-xs text-muted-foreground">Execute <code>pnpm db:push</code> sur la base distante, ou ajoute manuellement la colonne manquante.</p>
      </div>
    );
  }
  if (!project) notFound();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Projet
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">Personnages</h1>
          <p className="text-muted-foreground mt-1 text-sm">Canon pack par perso — stabilité visuelle sur les chapitres.</p>
        </div>
        <Button asChild className="gap-2">
          <Link href={`/projects/${id}/characters/new`}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Link>
        </Button>
      </div>
      <div className="grid gap-3">
        {project.characters.map((c) => (
          <Link key={c.id} href={`/projects/${id}/characters/${c.id}`}>
            <Card className="border-border/60 bg-card/40 transition hover:border-accent/40">
              <CardHeader className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <p className="text-muted-foreground text-sm">{c.roleType ?? "Rôle à définir"}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {c.status ? <Badge variant="outline">{c.status}</Badge> : null}
                    {c.canonLocked ? <Badge>canon lock</Badge> : null}
                  </div>
                </div>
              </CardHeader>
              {c.biography ? (
                <CardContent className="space-y-3 pt-0">
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.biography}</p>
                  {c.visualRefs[0]?.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.visualRefs[0].imageUrl} alt="" className="h-32 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                      Référence visuelle à générer
                    </div>
                  )}
                </CardContent>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>
      {project.characters.length > 0 ? (
        <Card className="border-border/60 bg-card/30">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-accent" />
              Réseau narratif
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {project.relationships.length > 0
              ? `${project.relationships.length} relations enregistrées dans le projet.`
              : "Aucune relation encore enregistrée. Utilise la fiche personnage pour commencer la matrice."}
          </CardContent>
        </Card>
      ) : null}
      {project.characters.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun personnage — crée le héros et l’antagoniste pour ancrer l’histoire.</p>
      ) : null}
    </div>
  );
}
