"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Coins, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function DemoLabClient({ initialProject }: { initialProject?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialProject === "neon-ronin" ? "Neon Ronin Protocol" : "Ashes of the Veil");
  const [chapterTitle, setChapterTitle] = useState("Chapitre 3 — La descente");
  const [intent, setIntent] = useState(
    "Je veux un chapitre tendu, lisible comme un manga, avec révélation, montée dramatique et cliffhanger final.",
  );
  const [tone, setTone] = useState(initialProject === "neon-ronin" ? "cyberpunk noir" : "dark fantasy tragique");

  const previewHref = useMemo(() => {
    const params = new URLSearchParams({
      title,
      chapterTitle,
      intent,
      tone,
      custom: "1",
    });
    return `/demo/reader?${params.toString()}`;
  }, [chapterTitle, intent, title, tone]);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge>Labo de démo</Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Simule un chapitre sur mesure comme dans le vrai produit.</h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Cette démo reproduit le masque produit attendu : choix du manga, intention du chapitre, ton, et projection vers une lecture manga-first.
            </p>
          </div>
          <Card className="border-border/60 bg-card/50">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
                <Coins className="h-5 w-5 text-accent" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">Crédits de bienvenue</p>
                <p className="text-2xl font-semibold">500</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Créer la suite</CardTitle>
            <CardDescription>Version démo du flux “bibliothèque → labo → lecture”.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Manga</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Titre du chapitre</Label>
              <Input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ton / direction</Label>
              <Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="dark fantasy, thriller, romance..." />
            </div>
            <div className="space-y-2">
              <Label>Intention sur mesure</Label>
              <Textarea value={intent} onChange={(e) => setIntent(e.target.value)} rows={5} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="gap-2" onClick={() => router.push(previewHref)}>
                <Wand2 className="h-4 w-4" />
                Générer la preview démo
              </Button>
              <Button asChild variant="outline">
                <Link href="/demo/mangas">Retour à la bibliothèque</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Ce que montre cette démo</CardTitle>
            <CardDescription>Tu dois pouvoir visualiser le vrai produit avant même de te connecter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border/60 bg-background/30 p-4">Bibliothèque personnelle avec reprise de lecture.</div>
            <div className="rounded-2xl border border-border/60 bg-background/30 p-4">Labo simple pour lancer un chapitre sur mesure.</div>
            <div className="rounded-2xl border border-border/60 bg-background/30 p-4">Lecture manga ouverte, droite vers gauche, avec sensation premium.</div>
            <Button asChild variant="secondary" className="w-full gap-2">
              <Link href={previewHref}>
                Ouvrir la lecture démo <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

