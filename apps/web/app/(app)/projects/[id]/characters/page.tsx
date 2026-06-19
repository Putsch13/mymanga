import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Pencil, ArrowRight } from "lucide-react";
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

/** Classe un rôle libre/structuré dans l'un des 4 groupes d'affichage. */
function roleGroup(role: string | null): "hero" | "antagonist" | "secondary" | "npc" {
  const r = (role ?? "").toLowerCase();
  if (r.includes("hero") || r.includes("héros") || r.includes("protag") || r.includes("main") || r.includes("lead"))
    return "hero";
  if (r.includes("antagon") || r.includes("méchant") || r.includes("villain") || r.includes("ennemi"))
    return "antagonist";
  if (r.includes("npc") || r.includes("pnj")) return "npc";
  return "secondary";
}

const GROUP_META: Record<
  ReturnType<typeof roleGroup>,
  { label: string; hint: string }
> = {
  hero: { label: "Héros", hint: "Protagonistes ancrés de l'histoire." },
  antagonist: { label: "Antagonistes", hint: "Méchants et forces adverses." },
  secondary: { label: "Personnages secondaires", hint: "Alliés, soutiens, récurrents." },
  npc: { label: "PNJ récurrents", hint: "Figures de fond cohérentes entre chapitres." },
};

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
      },
    });
  } catch (e) {
    console.error("[characters-page] DB error:", e instanceof Error ? e.message : e);
    return (
      <div className="space-y-4 p-6">
        <p className="text-red-400 text-sm">Erreur de chargement des personnages.</p>
      </div>
    );
  }
  if (!project) notFound();

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

  const groups: Record<ReturnType<typeof roleGroup>, typeof project.characters> = {
    hero: [],
    antagonist: [],
    secondary: [],
    npc: [],
  };
  for (const c of project.characters) groups[roleGroup(c.roleType)].push(c);

  const hasCharacters = project.characters.length > 0;
  const hasHero = groups.hero.length > 0;

  const renderCard = (c: (typeof project.characters)[number]) => {
    const previewUrl = previewMap.get(c.id) ?? null;
    const initials = initialsFromName(c.name);
    const placeholderBg = colorFromName(c.name);
    return (
      <Card key={c.id} className="group relative border-border/60 bg-card/40 transition hover:border-accent/40">
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
            {c.canonLocked ? <Badge>canon lock</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="relative z-10 space-y-3 pt-0 pointer-events-none">
          <div
            className="relative h-40 w-full overflow-hidden rounded-lg ring-1 ring-border/50"
            style={!previewUrl ? { backgroundColor: placeholderBg } : undefined}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={c.name} loading="lazy" className="h-full w-full object-cover object-top" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white">
                  {initials}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-white/70">Référence à générer</span>
              </div>
            )}
          </div>
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
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Projet
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">Personnages</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Étape 1 — crée tes héros, antagonistes et PNJ récurrents avant de lancer l&apos;interview IA.
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href={`/projects/${id}/characters/new`}>
            <Plus className="h-4 w-4" />
            Ajouter un personnage
          </Link>
        </Button>
      </div>

      {hasCharacters ? (
        (["hero", "antagonist", "secondary", "npc"] as const)
          .filter((g) => groups[g].length > 0)
          .map((g) => (
            <section key={g} className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">{GROUP_META[g].label}</h2>
                <p className="text-xs text-muted-foreground">{GROUP_META[g].hint}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{groups[g].map(renderCard)}</div>
            </section>
          ))
      ) : (
        <Card className="border-dashed border-border/60 bg-card/30">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun personnage pour l&apos;instant. Crée d&apos;abord ton héros pour ancrer l&apos;histoire.
            </p>
            <Button asChild className="gap-2">
              <Link href={`/projects/${id}/characters/new`}>
                <Plus className="h-4 w-4" />
                Créer le héros
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* CTA : passer à l'interview IA (étape suivante du flux). */}
      {hasCharacters ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Étape 2 — Configurer un chapitre avec l&apos;IA</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {hasHero
                  ? "Tes personnages sont prêts. L'interviewer IA va construire l'histoire autour d'eux."
                  : "Astuce : ajoute au moins un héros pour un protagoniste bien ancré."}
              </p>
            </div>
            <Button asChild className="gap-2">
              <Link href={`/projects/${id}/chapters`}>
                Lancer l&apos;interview IA
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
