import Link from "next/link";
import { ArrowRight, BookMarked, BookOpenText, Coins, Sparkles, Wand2 } from "lucide-react";
import { demoMangaPages } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoIndexPage() {
  const totalPanels = demoMangaPages.reduce((s, p) => s + p.panels.length, 0);

  return (
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-8 py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.14),transparent_24%)]" />
        <div className="relative">
          <div className="flex flex-wrap gap-2">
            <Badge>D&eacute;mo publique</Badge>
            <Badge variant="outline">Sans connexion</Badge>
            <Badge variant="outline">Biblioth&egrave;que + labo + lecture</Badge>
          </div>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight">
            La d&eacute;mo doit montrer le <span className="text-gradient">vrai produit</span> : biblioth&egrave;que, chapitre sur mesure et lecture manga.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Sans compte, tu peux d&eacute;j&agrave; voir comment un utilisateur retrouve ses mangas, lance un nouveau chapitre au labo, puis lit dans un
            vrai lecteur manga ouvert.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button size="lg" asChild className="gap-2 shadow-lg shadow-violet-900/40">
              <Link href="/demo/mangas">
                Voir ma biblioth&egrave;que <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/demo/lab">Tester le labo</Link>
            </Button>
            <Button size="lg" variant="ghost" asChild>
              <Link href="/login">Connexion</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <BookMarked className="h-8 w-8 text-accent" />
            <CardTitle>Biblioth&egrave;que manga</CardTitle>
            <CardDescription>Reprendre une s&eacute;rie, lire le dernier chapitre et revenir plus tard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" asChild className="w-full">
              <Link href="/demo/mangas">Ouvrir Mes mangas</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <Wand2 className="h-8 w-8 text-accent" />
            <CardTitle>Labo sur mesure</CardTitle>
            <CardDescription>Choisir un manga, poser son intention et visualiser le masque de génération attendu.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" asChild className="w-full">
              <Link href="/demo/lab">Ouvrir le labo</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <BookOpenText className="h-8 w-8 text-accent" />
            <CardTitle>Lecteur manga</CardTitle>
            <CardDescription>{demoMangaPages.length} pages &middot; {totalPanels} cases &middot; navigation manga-first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" asChild className="w-full">
              <Link href="/demo/reader">Lire le chapitre</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <Sparkles className="h-6 w-6 text-accent" />
          <CardTitle>Ce que montre cette d&eacute;mo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/60 p-4">Biblioth&egrave;que personnelle avec reprise de lecture</div>
          <div className="rounded-xl border border-border/60 p-4">Labo simple pour lancer un chapitre sur mesure</div>
          <div className="rounded-xl border border-border/60 p-4">Lecture manga avec sensation d&apos;ouvrage ouvert</div>
          <div className="rounded-xl border border-border/60 p-4">Logique cr&eacute;dits de bienvenue et funnel d&apos;usage</div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Coins className="h-5 w-5 text-accent" />
              Positionnement cr&eacute;dits
            </CardTitle>
            <CardDescription>Le compte d&eacute;marre avec une enveloppe d&apos;essai pour donner envie d&apos;aller jusqu&apos;au premier vrai chapitre.</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-lg">Objectif UX</CardTitle>
            <CardDescription>En moins de 20 secondes, l&apos;utilisateur doit comprendre : cr&eacute;er, g&eacute;n&eacute;rer, lire, poursuivre.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
