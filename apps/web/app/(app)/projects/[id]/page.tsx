import Link from "next/link";
import { notFound } from "next/navigation";
import { BookMarked, BookOpen, Brush, GitBranch, Globe2, ImageIcon, Palette, ScrollText, Settings, Users, Wand2, History } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const tiles = (id: string) =>
  [
    {
      href: `/projects/${id}/chapters`,
      title: "Chapitres",
      desc: "Studio de création, génération, revue QA et lecture.",
      icon: BookMarked,
    },
    {
      href: `/projects/${id}/characters`,
      title: "Personnages",
      desc: "Fiches, canon pack, cohérence visuelle.",
      icon: Users,
    },
    {
      href: `/projects/${id}/canon`,
      title: "Canon visuel",
      desc: "Style pack, décor, locks et cohérence canon-first.",
      icon: Palette,
    },
    {
      href: `/projects/${id}/bible`,
      title: "Bible",
      desc: "Règles du monde, lore, canon verrouillé.",
      icon: BookOpen,
    },
    {
      href: `/projects/${id}/world`,
      title: "Monde vivant",
      desc: "Groupes PNJ et accessoires détectés par l'IA depuis tes intentions, éditables.",
      icon: Globe2,
    },
    {
      href: `/projects/${id}/style`,
      title: "Style visuel",
      desc: "Style-pack, famille de rendu, line weight, caméra.",
      icon: Brush,
    },
    {
      href: `/projects/${id}/chapters/new`,
      title: "Nouveau chapitre",
      desc: "Wizard studio, validation readiness puis génération.",
      icon: Wand2,
    },
    {
      href: `/projects/${id}/assets`,
      title: "Assets",
      desc: "Références, variations validées et ressources canon.",
      icon: ImageIcon,
    },
    {
      href: `/projects/${id}/settings`,
      title: "Réglages",
      desc: "Préférences du projet et garde-fous du studio.",
      icon: Settings,
    },
    {
      href: `/projects/${id}/history`,
      title: "Historique",
      desc: "États studio, transitions et versions récentes.",
      icon: History,
    },
  ] as const;

export default async function ProjectOverviewPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  let project;
  try {
    project = await prisma.project.findFirst({
      where: { id, userId: user.id },
      include: {
        stylePacks: { orderBy: { version: "desc" }, take: 1 },
        characters: { take: 8, orderBy: { createdAt: "desc" } },
        chapters: { take: 4, orderBy: { chapterNumber: "desc" } },
        arcs: { take: 4, orderBy: [{ startChapterNumber: "asc" }, { name: "asc" }] },
        relationships: { take: 8, orderBy: { updatedAt: "desc" } },
        settings: true,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isMigration =
      msg.includes("column") || msg.includes("does not exist") ||
      msg.includes("P2022") || msg.includes("Unknown field");
    console.error("[project-page] DB error:", msg);
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium">
          {isMigration ? "Mise à jour de la base de données en cours." : "Erreur de chargement du projet."}
        </p>
        <p className="text-sm text-muted-foreground max-w-md">Réessaie dans quelques instants.</p>
        <Button asChild variant="outline"><Link href="/dashboard">← Dashboard</Link></Button>
      </div>
    );
  }
  if (!project) notFound();

  const sp = project.stylePacks[0];

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">{project.title}</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{project.pitch ?? "Ajoute un pitch pour guider l’IA."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>{project.primaryGenre ?? "Genre"}</Badge>
            <Badge variant="outline">{project.intensityLayer}</Badge>
            <Badge variant="secondary">{project.contentRating}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="border-border">
            <Link href={`/projects/${id}/characters/new`}>Nouveau personnage</Link>
          </Button>
          <Button asChild variant="outline" className="border-border">
            <Link href={`/projects/${id}/characters`}>Configurer héros / antagonistes</Link>
          </Button>
          <Button asChild className="border-border">
            <Link href={`/projects/${id}/chapters/new`}>Continuer dans le studio chapitre</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles(id).map(({ href, title, desc, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="h-full border-border/60 bg-card/40 transition hover:border-accent/35 hover:bg-card/70">
              <CardHeader>
                <Icon className="mb-2 h-8 w-8 text-accent" />
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{desc}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-border/60 bg-card/30">
          <CardHeader>
            <CardTitle className="text-lg">Vue d&apos;ensemble</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{project.description ?? "Ajoute une description longue pour mieux guider la mémoire et les futurs chapitres."}</p>
            <dl className="grid gap-2">
              <div className="flex items-center justify-between">
                <dt>Format</dt>
                <dd className="font-medium text-foreground">{project.format ?? "manga"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Ton</dt>
                <dd className="font-medium text-foreground">{project.tone ?? "à préciser"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Style visuel</dt>
                <dd className="font-medium text-foreground">{project.visualStyle ?? "à définir"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Persos</dt>
                <dd className="font-medium text-foreground">{project.characters.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Arcs</dt>
                <dd className="font-medium text-foreground">{project.arcs.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Relations</dt>
                <dd className="font-medium text-foreground">{project.relationships.length}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GitBranch className="h-5 w-5 text-accent" />
              Arcs narratifs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {project.arcs.length > 0 ? (
              project.arcs.map((arc) => (
                <div key={arc.id} className="rounded-lg border border-border/60 p-3">
                  <p className="font-medium">{arc.name}</p>
                  <p className="text-muted-foreground">{arc.summary ?? "Pas encore de résumé."}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">Aucun arc encore défini. Tu peux commencer à structurer tes sous-intrigues via l’API d’arcs V3.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ScrollText className="h-5 w-5 text-accent" />
              Chapitres récents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {project.chapters.length > 0 ? (
              project.chapters.map((chapter) => (
                <Link key={chapter.id} href={`/projects/${id}/chapters/${chapter.id}/read`} className="block rounded-lg border border-border/60 p-3 transition hover:border-accent/40">
                  <p className="font-medium">{chapter.title ?? `Chapitre ${chapter.chapterNumber}`}</p>
                  <p className="text-muted-foreground">{chapter.summary ?? "Pas encore de résumé."}</p>
                </Link>
              ))
            ) : (
              <p className="text-muted-foreground">Aucun chapitre encore généré.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/30">
        <CardHeader>
          <CardTitle className="text-lg">Aperçu style pack</CardTitle>
          <CardDescription>Le style n’est plus un prompt libre : il est canonique.</CardDescription>
        </CardHeader>
        <CardContent>
          {sp ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["Famille", sp.renderFamily],
                  ["Ligne", sp.lineWeight],
                  ["Ombrage", sp.shadingMode],
                  ["Contraste", sp.contrastProfile],
                  ["Anatomie", sp.anatomyBias],
                  ["Fond", sp.backgroundDensity],
                  ["Caméra", sp.cameraLanguage],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun style pack — normalement créé à la création du projet.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/30">
        <CardHeader>
          <CardTitle className="text-lg">Curseurs créatifs</CardTitle>
          <CardDescription>Le projet encode déjà les garde-fous de ton, rythme et continuité.</CardDescription>
        </CardHeader>
        <CardContent>
          {project.settings ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Violence", project.settings.violenceLevel],
                  ["Romance", project.settings.romanceLevel],
                  ["Sensualité", project.settings.sensualityLevel],
                  ["Noirceur", project.settings.darknessLevel],
                  ["Mystère", project.settings.mysteryLevel],
                  ["Réalisme", project.settings.realismLevel],
                  ["Rythme", project.settings.pacingLevel],
                  ["Dialogue", project.settings.dialogueDensity],
                  ["Canon", project.settings.canonStrictness],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}/100</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun réglage avancé pour l’instant.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
