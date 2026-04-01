import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function CharactersPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: { characters: { orderBy: { createdAt: "desc" } } },
  });
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
          <Card key={c.id} className="border-border/60 bg-card/40">
            <CardHeader className="py-4">
              <CardTitle className="text-base">{c.name}</CardTitle>
              <p className="text-muted-foreground text-sm">{c.roleType ?? "Rôle à définir"}</p>
            </CardHeader>
            {c.biography ? (
              <CardContent className="pt-0 text-sm text-muted-foreground line-clamp-2">{c.biography}</CardContent>
            ) : null}
          </Card>
        ))}
      </div>
      {project.characters.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun personnage — crée le héros et l’antagoniste pour ancrer l’histoire.</p>
      ) : null}
    </div>
  );
}
