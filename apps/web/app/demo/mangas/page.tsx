import Link from "next/link";
import { BookOpen, Plus, Wand2 } from "lucide-react";
import { demoProject } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const demoLibrary = [
  {
    id: "demo-project",
    title: demoProject.title,
    pitch: demoProject.pitch,
    chapters: 2,
    characters: 4,
    status: "en cours",
    readHref: "/demo/reader",
    generateHref: "/demo/lab",
  },
  {
    id: "demo-project-2",
    title: "Neon Ronin Protocol",
    pitch: "Un exécuteur cybernétique remonte une conspiration qui manipule les souvenirs des districts flottants.",
    chapters: 1,
    characters: 3,
    status: "prêt à poursuivre",
    readHref: "/demo/reader?title=Neon%20Ronin%20Protocol&chapter=1",
    generateHref: "/demo/lab?project=neon-ronin",
  },
];

export default function DemoMangasPage() {
  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Mes mangas</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Démo de la vraie bibliothèque produit : reprendre une série, lire le dernier chapitre, ou relancer une génération sur mesure.
            </p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/demo/lab">
              <Plus className="h-4 w-4" />
              Créer un nouveau manga
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {demoLibrary.map((manga) => (
          <Card key={manga.id} className="border-border/60 bg-card/50">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg leading-tight">{manga.title}</CardTitle>
                <Badge variant="secondary">{manga.status}</Badge>
              </div>
              <CardDescription className="line-clamp-2">{manga.pitch}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{manga.chapters} chapitres</Badge>
                <Badge variant="outline">{manga.characters} persos</Badge>
                <Badge variant="outline">Démo publique</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="gap-2">
                  <Link href={manga.readHref}>
                    <BookOpen className="h-4 w-4" />
                    Continuer la lecture
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-2">
                  <Link href={manga.generateHref}>
                    <Wand2 className="h-4 w-4" />
                    Générer la suite
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/demo/project">Ouvrir le studio</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

