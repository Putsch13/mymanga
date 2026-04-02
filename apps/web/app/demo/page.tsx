import Link from "next/link";
import { ArrowRight, BookOpenText, LayoutDashboard, Sparkles, Users } from "lucide-react";
import { demoMangaPages } from "@/lib/demo-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoIndexPage() {
  const totalPanels = demoMangaPages.reduce((s, p) => s + p.panels.length, 0);

  return (
    <div className="space-y-10">
      <div className="hero-grid rounded-[2rem] border border-border/60 bg-black/20 px-8 py-12">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">D&eacute;mo publique</span>
          <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">Sans connexion</span>
          <span className="rounded-full border border-accent/40 px-3 py-1 text-xs text-accent">{totalPanels} cases manga</span>
        </div>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight">
          Explore l&apos;exp&eacute;rience V3 : <span className="text-gradient">lecteur manga multi-panel</span>, personnages, arcs et pipeline chapitre.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Chaque page contient 6 &agrave; 7 cases avec compositions vari&eacute;es, bulles de dialogue, narration et effets sonores.
          Navigation clavier, mode plein &eacute;cran et prompt de continuation en fin de chapitre.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Button size="lg" asChild className="gap-2 shadow-lg shadow-violet-900/40">
            <Link href="/demo/reader">
              Lire le manga <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/demo/dashboard">Voir le dashboard</Link>
          </Button>
          <Button size="lg" variant="ghost" asChild>
            <Link href="/login">Connexion</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <LayoutDashboard className="h-8 w-8 text-accent" />
            <CardTitle>Dashboard studio</CardTitle>
            <CardDescription>Carte projet, progression s&eacute;rie, acc&egrave;s direct au lecteur et au pipeline de g&eacute;n&eacute;ration.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" asChild className="w-full">
              <Link href="/demo/dashboard">Voir le dashboard</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <Users className="h-8 w-8 text-accent" />
            <CardTitle>Projet &amp; personnages</CardTitle>
            <CardDescription>4 fiches personnages canoniques, 2 arcs narratifs, wallet tokens et m&eacute;triques de s&eacute;rie.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" asChild className="w-full">
              <Link href="/demo/project">Voir le projet</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <BookOpenText className="h-8 w-8 text-accent" />
            <CardTitle>Lecteur manga</CardTitle>
            <CardDescription>{demoMangaPages.length} pages &middot; {totalPanels} cases &middot; bulles &middot; SFX &middot; continuation interactive.</CardDescription>
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
        <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-border/60 p-4">Pages manga avec 6-7 cases et layouts vari&eacute;s (grilles asym&eacute;triques)</div>
          <div className="rounded-xl border border-border/60 p-4">Bulles de dialogue avec attribution de personnage + narration</div>
          <div className="rounded-xl border border-border/60 p-4">Effets sonores (SFX) int&eacute;gr&eacute;s aux cases</div>
          <div className="rounded-xl border border-border/60 p-4">Navigation clavier (&larr; &rarr; espace) + clic pour tourner la page</div>
          <div className="rounded-xl border border-border/60 p-4">Mode plein &eacute;cran pour lecture immersive</div>
          <div className="rounded-xl border border-border/60 p-4">Prompt de continuation en fin de chapitre avec suggestions et tags</div>
        </CardContent>
      </Card>
    </div>
  );
}
