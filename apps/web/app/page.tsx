import Link from "next/link";
import { ArrowRight, Layers, Shield, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#070709] via-[#0b0b12] to-[#070709]">
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
          <Button asChild>
            <Link href="/dashboard">Entrer</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-accent">V3 · Multi-provider · Canon-first</p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
            Le studio IA pour séries manga à identité stable
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg">
            FLUX, Runware, Stability routés intelligemment. Style packs, canon packs, PromptComposer v2, modération par intensité — pensé pour
            dark fantasy & seinen premium.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button size="lg" asChild className="gap-2 shadow-lg shadow-violet-900/40">
              <Link href="/dashboard">
                Lancer le studio <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-border/80">
              <Link href="/login">Créer un compte</Link>
            </Button>
          </div>
        </div>

        <div className="mt-24 grid gap-6 md:grid-cols-3">
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <Zap className="mb-2 h-8 w-8 text-amber-400" />
              <CardTitle className="text-lg">Routage image</CardTitle>
              <CardDescription>Pas un seul moteur : fal / BFL, Runware LoRA & Comfy, Stability Ultra en fallback réaliste.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <Layers className="mb-2 h-8 w-8 text-violet-400" />
              <CardTitle className="text-lg">DA structurée</CardTitle>
              <CardDescription>Style pack + canon pack + score de cohérence — workflow manga-first.</CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/50 bg-card/40">
            <CardHeader>
              <Shield className="mb-2 h-8 w-8 text-emerald-400" />
              <CardTitle className="text-lg">Monétisation web</CardTitle>
              <CardDescription>Stripe + ledger tokens. Paiement web uniquement, wallet interne et suivi comptable.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    </div>
  );
}
