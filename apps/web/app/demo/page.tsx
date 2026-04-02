import Link from "next/link";
import { ArrowRight, BookOpenText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoIndexPage() {
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="rounded-[2rem] border border-border/60 bg-black/20 px-8 py-12">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">Démo publique</span>
            <span className="rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">Sans connexion</span>
          </div>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight">
            Explore l’interface V3 même si l’environnement de production n’est pas encore totalement branché.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Cette démo montre le dashboard, un projet, le lecteur manga et le wallet dans un univers de démonstration inspiré de la vision produit.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Button size="lg" asChild>
              <Link href="/demo/dashboard">
                Ouvrir la démo <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Retour à la connexion</Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <Sparkles className="h-8 w-8 text-accent" />
              <CardTitle>Dashboard studio</CardTitle>
              <CardDescription>Vision premium, cartes projet et progression série.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" asChild className="w-full">
                <Link href="/demo/dashboard">Voir le dashboard</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <BookOpenText className="h-8 w-8 text-accent" />
              <CardTitle>Projet & bible</CardTitle>
              <CardDescription>Personnages, arcs, ton, lecteur et pipeline V3.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" asChild className="w-full">
                <Link href="/demo/project">Voir le projet</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <Sparkles className="h-8 w-8 text-accent" />
              <CardTitle>Lecteur manga</CardTitle>
              <CardDescription>Lecture stylisée en grand format avec pages de démo.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" asChild className="w-full">
                <Link href="/demo/reader">Voir le lecteur</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
