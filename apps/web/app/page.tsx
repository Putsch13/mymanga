import Link from "next/link";
import { ArrowRight, BookOpenText, Coins, LibraryBig, Sparkles, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  "1. Tu crées un univers et son ambition de série",
  "2. Tu lances le premier chapitre avec tes crédits de bienvenue",
  "3. Tu lis en mode manga, puis tu poursuis l’histoire",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
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
            <Link href="/login">Essayer maintenant</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/25 px-6 py-16 shadow-2xl shadow-violet-950/20 md:px-10 md:py-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.14),transparent_26%)]" />
          <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge>Site web SaaS</Badge>
                <Badge variant="outline">Lecture manga traditionnelle</Badge>
                <Badge variant="outline">Crédits de bienvenue</Badge>
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
                Crée ton manga, génère ton premier chapitre, puis fais revenir l’utilisateur pour la suite.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                L’expérience est pensée comme un produit vendable : un onboarding simple, des crédits offerts au départ, une bibliothèque personnelle,
                un labo de génération et un lecteur qui donne la sensation de lire un vrai manga.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <Button size="lg" asChild className="gap-2 shadow-lg shadow-violet-900/40">
                  <Link href="/login">
                    Créer mon compte <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="secondary" asChild className="gap-2">
                  <Link href="/demo">
                    Voir la démo <BookOpenText className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle>Parcours idéal</CardTitle>
                <CardDescription>Le produit doit être clair en moins de 20 secondes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {steps.map((step) => (
                  <div key={step} className="rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
                    {step}
                  </div>
                ))}
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
                    <p className="text-xs text-muted-foreground">Offre de départ</p>
                    <p className="mt-1 text-2xl font-semibold">500 crédits</p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
                    <p className="text-xs text-muted-foreground">Promesse chapitre</p>
                    <p className="mt-1 text-sm font-medium">≈ 6 pages manga par chapitre</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mt-16 grid gap-5 md:grid-cols-3">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <LibraryBig className="mb-2 h-8 w-8 text-violet-400" />
              <CardTitle className="text-lg">Ma bibliothèque</CardTitle>
              <CardDescription>Chaque utilisateur retrouve ses mangas, ses derniers chapitres et les reprend en un clic.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <Wand2 className="mb-2 h-8 w-8 text-rose-300" />
              <CardTitle className="text-lg">Labo de génération</CardTitle>
              <CardDescription>Créer vite, générer vite, comprendre le statut réel des images et débloquer sans friction.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <Coins className="mb-2 h-8 w-8 text-amber-400" />
              <CardTitle className="text-lg">Monétisation claire</CardTitle>
              <CardDescription>Des crédits offerts pour tester, puis un parcours naturel pour continuer et acheter davantage.</CardDescription>
            </CardHeader>
          </Card>
        </section>
      </main>
    </div>
  );
}
