import Link from "next/link";
import { notFound } from "next/navigation";
import { BookMarked, BookOpen, ImageIcon, Palette, Users, Wand2 } from "lucide-react";
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
      title: "Chapitres & lecture",
      desc: "Liste, lecteur manga (feuilletage), suite en fin de chapitre.",
      icon: BookMarked,
    },
    {
      href: `/projects/${id}/characters`,
      title: "Personnages",
      desc: "Fiches, canon pack, cohérence visuelle.",
      icon: Users,
    },
    {
      href: `/projects/${id}/style`,
      title: "Style pack",
      desc: "DA structurée : ligne, ombres, caméra, LoRAs.",
      icon: Palette,
    },
    {
      href: `/projects/${id}/bible`,
      title: "Bible",
      desc: "Règles du monde, lore, canon verrouillé.",
      icon: BookOpen,
    },
    {
      href: `/projects/${id}/generate`,
      title: "Chapitre & images",
      desc: "Estimation routing, tokens, génération IA.",
      icon: Wand2,
    },
    {
      href: `/projects/${id}/studio`,
      title: "Studio image",
      desc: "Test fal / Runware / Stability avec débit tokens.",
      icon: ImageIcon,
    },
  ] as const;

export default async function ProjectOverviewPage({ params }: Props) {
  const user = await getCurrentUser();
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: { stylePacks: { orderBy: { version: "desc" }, take: 1 }, characters: { take: 8 } },
  });
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
        <Button asChild variant="outline" className="border-border">
          <Link href={`/projects/${id}/generate`}>Continuer le flux créatif</Link>
        </Button>
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
    </div>
  );
}
