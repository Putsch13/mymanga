import Link from "next/link";
import { ArrowRight, BookOpenText, Plus, Sparkles } from "lucide-react";
import { demoMangaPages, demoProject } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoDashboardPage() {
  const totalPanels = demoMangaPages.reduce((s, p) => s + p.panels.length, 0);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8 shadow-2xl shadow-violet-950/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.14),transparent_28%)]" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-accent">Studio de d&eacute;mo</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight">Bonjour, Florent</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Explore le dashboard V3, le projet d&eacute;mo et surtout le lecteur manga avec ses {totalPanels} cases r&eacute;parties sur {demoMangaPages.length} pages.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline">1 projet d&eacute;mo</Badge>
              <Badge variant="outline">{demoProject.stats.characters} personnages</Badge>
              <Badge variant="outline">{totalPanels} cases manga</Badge>
            </div>
          </div>
          <Button asChild size="lg" className="gap-2">
            <Link href="/demo/project">
              <Plus className="h-4 w-4" />
              Ouvrir le projet
            </Link>
          </Button>
        </div>
      </div>

      {/* Project card + quick actions */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Link href="/demo/project" className="group block">
          <Card className="h-full overflow-hidden border-border/60 bg-card/50 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-violet-950/20">
            <div className="h-28 bg-[linear-gradient(135deg,rgba(124,58,237,0.38),rgba(190,18,60,0.16)),radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_35%)]" />
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg leading-tight group-hover:text-accent">{demoProject.title}</CardTitle>
                <Badge variant="secondary">active</Badge>
              </div>
              <CardDescription className="line-clamp-2">{demoProject.pitch}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs text-muted-foreground">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span>Progression s&eacute;rie</span>
                  <span className="text-foreground">{demoProject.stats.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-background/80">
                  <div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-rose-500" style={{ width: `${demoProject.stats.progress}%` }} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{demoProject.stats.characters} perso.</span>
                <span>&middot;</span>
                <span>{demoProject.stats.chapters} chapitres</span>
                <span>&middot;</span>
                <span>{totalPanels} cases</span>
              </div>
              <div className="flex items-center gap-2 text-accent">
                Ouvrir le studio <ArrowRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/demo/reader" className="group block">
          <Card className="h-full overflow-hidden border-border/60 bg-card/50 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-violet-950/20">
            <div className="flex h-28 items-center justify-center bg-gradient-to-br from-stone-900 to-stone-950">
              <BookOpenText className="h-10 w-10 text-stone-500 transition group-hover:text-accent" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg group-hover:text-accent">Lecteur manga</CardTitle>
              <CardDescription>
                {demoMangaPages.length} pages &middot; {totalPanels} cases &middot; bulles de dialogue &middot; SFX &middot; navigation clavier
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-xs text-accent">
                Lire le chapitre 2 <ArrowRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="border-dashed border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-accent" />
              Mode d&eacute;mo
            </CardTitle>
            <CardDescription>
              Test UX complet sans connexion ni base de donn&eacute;es.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Valide le rendu des pages manga, les parcours utilisateur et le design premium avant de brancher la prod.</p>
            <Button asChild variant="outline">
              <Link href="/login">Passer en mode connect&eacute;</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
