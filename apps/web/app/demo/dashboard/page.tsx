import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { demoProject } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoDashboardPage() {
  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8 shadow-2xl shadow-violet-950/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.14),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-accent">Démo studio</p>
              <h1 className="mt-1 text-4xl font-semibold tracking-tight">Bonjour, Florent</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Vue de démonstration du dashboard V3 pendant que l’auth, la DB ou les variables de prod sont encore en cours de branchement.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline">1 projet démo</Badge>
                <Badge variant="outline">{demoProject.stats.characters} personnages</Badge>
                <Badge variant="outline">{demoProject.stats.chapters} chapitres</Badge>
              </div>
            </div>
            <Button asChild size="lg" className="gap-2">
              <Link href="/demo/project">
                <Plus className="h-4 w-4" />
                Ouvrir le projet de démo
              </Link>
            </Button>
          </div>
        </div>

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
                    <span>Progression série</span>
                    <span className="text-foreground">{demoProject.stats.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-background/80">
                    <div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-rose-500" style={{ width: `${demoProject.stats.progress}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{demoProject.stats.characters} perso.</span>
                  <span>·</span>
                  <span>{demoProject.stats.chapters} chapitres</span>
                  <span>·</span>
                  <span>DA gothic</span>
                </div>
                <div className="flex items-center gap-2 text-accent">
                  Ouvrir le studio projet <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Card className="border-dashed border-border/60 bg-card/40 md:col-span-1 xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-accent" />
                Mode démo
              </CardTitle>
              <CardDescription>
                Cette partie te laisse tester l&apos;UX, les parcours et le design pendant que la prod réelle est encore en cours de stabilisation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>Utilise la démo pour valider le rendu vendeur, la lisibilité, les cartes, les sections, le lecteur et la hiérarchie visuelle.</p>
              <Button asChild>
                <Link href="/demo/reader">Tester le lecteur manga</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
