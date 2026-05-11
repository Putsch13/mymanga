import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Sparkles, Pencil } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";
import { toProxiedServerUrl } from "@/lib/images/proxy-url.server";
import { DeleteCharacterButton } from "@/components/projects/delete-character-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function initialsFromName(name: string): string {
  const cleaned = name.trim();
  if (cleaned.length === 0) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 22%)`;
}

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
          include: { visualRefs: { where: { isPrimary: true, archivedAt: null }, take: 1 } },
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

  // P0 — vignette héros : on signe + proxifie côté serveur pour que l'URL
  // fonctionne dans le browser même quand le bucket Supabase est privé ou
  // que le CDN FAL/BFL est temporaire.
  const previewUrlByCharacter = await Promise.all(
    project.characters.map(async (c) => {
      const raw = c.visualRefs[0]?.imageUrl ?? null;
      if (!raw) return [c.id, null] as const;
      const signed = (await signSupabaseUrlIfNeeded(raw)) ?? raw;
      const proxied = toProxiedServerUrl(signed) ?? signed;
      return [c.id, proxied] as const;
    }),
  );
  const previewMap = new Map(previewUrlByCharacter);

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {project.characters.map((c) => {
          const previewUrl = previewMap.get(c.id) ?? null;
          const initials = initialsFromName(c.name);
          const placeholderBg = colorFromName(c.name);
          return (
            <Card
              key={c.id}
              className="group relative border-border/60 bg-card/40 transition hover:border-accent/40"
            >
              <Link
                href={`/projects/${id}/characters/${c.id}`}
                className="absolute inset-0 z-0"
                aria-label={`Ouvrir ${c.name}`}
              />
              <CardHeader className="relative z-10 py-4 pointer-events-none">
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
              <CardContent className="relative z-10 space-y-3 pt-0 pointer-events-none">
                <div
                  className="relative h-40 w-full overflow-hidden rounded-lg ring-1 ring-border/50"
                  style={!previewUrl ? { backgroundColor: placeholderBg } : undefined}
                >
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt={c.name}
                      loading="lazy"
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white">
                        {initials}
                      </span>
                      <span className="text-[11px] uppercase tracking-wider text-white/70">
                        Référence à générer
                      </span>
                    </div>
                  )}
                </div>
                {c.biography ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.biography}</p>
                ) : null}
              </CardContent>
              <div className="relative z-20 flex items-center justify-end gap-2 border-t border-border/50 px-4 py-2">
                <Link
                  href={`/projects/${id}/characters/${c.id}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/50 bg-background/60 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent"
                  aria-label={`Modifier ${c.name}`}
                  title="Modifier"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
                <DeleteCharacterButton characterId={c.id} characterName={c.name} variant="icon" />
              </div>
            </Card>
          );
        })}
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
