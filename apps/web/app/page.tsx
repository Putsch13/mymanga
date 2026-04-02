import Link from "next/link";
import { ArrowRight, BookOpenText, Clapperboard, Gem, Layers, Shield, Sparkles, Wand2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-rose-700">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          Manga AI Studio
        </span>
        <div className="flex gap-3">
          <Button variant="ghost" asChild>
            <Link href="/login">Connexion</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/demo">Démo</Link>
          </Button>
          <Button asChild>
            <Link href="/login">Créer un compte</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-8">
        <section className="hero-grid relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/25 px-6 py-16 shadow-2xl shadow-violet-950/20 md:px-10 md:py-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.14),transparent_26%)]" />
          <div className="relative grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge>Web SaaS</Badge>
                <Badge variant="outline">Memoire de continuite</Badge>
                <Badge variant="outline">Lecteur manga premium</Badge>
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
                Cree un <span className="text-gradient">univers manga complet</span>, fais-le evoluer chapitre apres chapitre et garde une vraie coherence.
              </h1>
              <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-8">
                Manga AI Studio n&apos;est pas un simple generateur de prompts. C&apos;est un studio de creation pour construire une serie, ses personnages,
                sa bible, ses arcs, ses chapitres, ses images et son lecteur final dans une seule interface premium.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Button size="lg" asChild className="gap-2 shadow-lg shadow-violet-900/40">
                  <Link href="/login">
                    Creer mon compte <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="secondary" asChild className="gap-2">
                  <Link href="/demo">
                    Explorer la démo <BookOpenText className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="border-border/80 bg-background/30">
                  <Link href="/login">Se connecter</Link>
                </Button>
              </div>
              <div className="mt-8 grid max-w-2xl gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
                  <p className="text-2xl font-semibold text-foreground">Univers</p>
                  <p>Bible, regles, themes, lore et memoire.</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
                  <p className="text-2xl font-semibold text-foreground">Chapitres</p>
                  <p>Pipeline narratif, storyboard, suite interactive.</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
                  <p className="text-2xl font-semibold text-foreground">Visuels</p>
                  <p>Refs personnage, panels et coherence visuelle.</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="border-violet-500/30 bg-card/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clapperboard className="h-5 w-5 text-accent" />
                    Pipeline creatif
                  </CardTitle>
                  <CardDescription>Direction creative, options de plot, script, storyboard, panels et mise a jour memoire.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">1. Projet + personnages + bible</div>
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">2. Estimation tokens + preview memoire</div>
                  <div className="rounded-xl border border-border/60 bg-background/40 p-3">3. Lecture manga + suite utilisateur</div>
                </CardContent>
              </Card>
              <Card className="border-rose-500/20 bg-card/55">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Gem className="h-5 w-5 text-rose-300" />
                    Positionnement premium
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Dark fantasy, seinen, thriller, romance tragique, webtoon premium.</p>
                  <p>Un outil concu pour produire une serie exploitable, pas juste un test IA.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <Zap className="mb-2 h-8 w-8 text-amber-400" />
              <CardTitle className="text-lg">Generation image intelligente</CardTitle>
              <CardDescription>Crée des visuels personnage, des scenes et des panels en gardant la coherence de style et de design.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <Layers className="mb-2 h-8 w-8 text-violet-400" />
              <CardTitle className="text-lg">Direction artistique structuree</CardTitle>
              <CardDescription>Style pack, refs visuelles, canon lock, garde-fous de continuite et controles narratifs.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <Shield className="mb-2 h-8 w-8 text-emerald-400" />
              <CardTitle className="text-lg">SaaS productisable</CardTitle>
              <CardDescription>Wallet tokens, jobs, moderation, exports et parcours web penses pour une vraie plateforme commerciale.</CardDescription>
            </CardHeader>
          </Card>
        </section>

        <section className="mt-24 grid gap-6 lg:grid-cols-2">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <BookOpenText className="h-5 w-5 text-accent" />
                Tout ce que tu peux faire
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="rounded-xl border border-border/60 p-4">Creer un univers manga et sa bible complete</div>
              <div className="rounded-xl border border-border/60 p-4">Designer les personnages et leurs relations</div>
              <div className="rounded-xl border border-border/60 p-4">Generer un chapitre avec memoire et arcs</div>
              <div className="rounded-xl border border-border/60 p-4">Lire l&apos;histoire dans un lecteur manga</div>
              <div className="rounded-xl border border-border/60 p-4">Demander la suite et brancher de nouveaux twists</div>
              <div className="rounded-xl border border-border/60 p-4">Exporter un chapitre, une bible ou un package projet</div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Wand2 className="h-5 w-5 text-accent" />
                Pourquoi c&apos;est different
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>La plateforme est pensee comme un studio narratif complet : projet, personnages, bible, chapitres, images, lecture et suite.</p>
              <p>Le coeur produit est la coherence : memoire recente, contexte de projet, relations, arcs, refs visuelles et garde-fous.</p>
              <p>Le rendu web est optimise pour un SaaS premium vendable, pas pour une demo technique isolee.</p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
