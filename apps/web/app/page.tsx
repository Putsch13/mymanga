import Link from "next/link";
import { ArrowRight, BookOpenText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const features = [
  {
    emoji: "🎌",
    title: "Personnages fidèles",
    desc: "Ton héros garde son visage, sa tenue et ses accessoires de la première à la dernière page. Un canon visuel strict garantit la cohérence entre tous les panels.",
  },
  {
    emoji: "📖",
    title: "Vrais plans manga",
    desc: "Splash pages, plans de coupe dramatiques, combats dynamiques, double pages — la mise en scène s'adapte automatiquement à l'intensité de chaque scène.",
  },
  {
    emoji: "⚡",
    title: "Tous les genres",
    desc: "Shōnen, seinen, horreur, isekai, romance, mecha, sport, médical — chaque genre a son propre rythme narratif, son style visuel et ses règles de cliffhanger.",
  },
];

const genres = [
  "⚔️ Shōnen Combat",
  "🌆 Seinen Tension",
  "💕 Romance Shōjo",
  "🌀 Isekai",
  "⚙️ Mecha",
  "🔮 Horreur & Gore",
  "🏃 Sport",
  "🏥 Drame médical",
];

const steps = [
  { n: "01", title: "Crée ton univers", desc: "Titre, pitch, genre, style visuel — l'IA construit les règles de ton monde en 30 secondes." },
  { n: "02", title: "Définis tes personnages", desc: "Fiche physique, tenue, traits — chaque personnage est mémorisé et restera identique panel après panel." },
  { n: "03", title: "Génère un chapitre", desc: "L'IA écrit le script, découpe en scènes et génère chaque panel avec les bons plans de coupe." },
  { n: "04", title: "Lis et continue", desc: "Lecteur manga immersif, fond noir, navigation RTL. Reprends à tout moment avec la mémoire complète." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
          <Button asChild>
            <Link href="/login">Essayer gratuitement</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-24">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/25 px-6 py-20 shadow-2xl shadow-violet-950/20 md:px-12 md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(124,58,237,0.25),transparent_60%),radial-gradient(circle_at_80%_50%,rgba(190,18,60,0.15),transparent_30%)]" />
          <div className="relative mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-950/40 px-4 py-1.5 text-xs font-medium text-violet-300">
              <Sparkles className="h-3 w-3" />
              Génération de manga par IA
            </div>
            <h1 className="mt-6 text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
              Ton manga.{" "}
              <span className="text-gradient-manga">Chapitre par chapitre.</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Crée tes personnages une fois — et génère des pages manga cohérentes avec plans de coupe
              dramatiques, dialogues et lecteur immersif intégré. Même univers, même style, de la
              première à la dernière page.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button size="lg" asChild className="gap-2 shadow-lg shadow-violet-900/40">
                <Link href="/login">
                  Créer mon manga <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild className="gap-2">
                <Link href="/login">
                  Voir le studio <BookOpenText className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mt-16 grid gap-5 sm:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="card-manga rounded-2xl border border-border/60 bg-card/40 p-6"
            >
              <div className="mb-4 text-3xl">{f.emoji}</div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>

        {/* Genres */}
        <section className="mt-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            Un moteur narratif pour chaque genre
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
            Chaque genre dispose de son propre rythme de beats, style de cliffhanger et densité de
            panels — généré automatiquement selon ton projet.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {genres.map((g) => (
              <span
                key={g}
                className="rounded-full border border-border/60 bg-card/40 px-4 py-2 text-sm font-medium text-muted-foreground"
              >
                {g}
              </span>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            De l&apos;idée au chapitre en 4 étapes
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div
                key={s.n}
                className="card-manga rounded-2xl border border-border/60 bg-card/40 p-6"
              >
                <div className="text-gradient-manga text-3xl font-bold">{s.n}</div>
                <h3 className="mt-3 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="mt-20">
          <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/25 px-6 py-14 text-center shadow-2xl shadow-violet-950/15">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(124,58,237,0.15),transparent_60%)]" />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Prêt à créer ton premier chapitre&nbsp;?
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
                Commence avec des crédits offerts. Aucune carte bancaire requise.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Button size="lg" asChild className="gap-2 shadow-lg shadow-violet-900/40">
                  <Link href="/login">
                    Créer mon compte <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer minimal */}
      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Manga AI Studio — Tous droits réservés
      </footer>
    </div>
  );
}
