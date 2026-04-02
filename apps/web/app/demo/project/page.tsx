import Link from "next/link";
import { BookOpenText, GitBranch, Sparkles, Users, Wallet, Wand2 } from "lucide-react";
import { demoArcs, demoCharacters, demoMangaPages, demoProject, demoTransactions } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoProjectPage() {
  const totalPanels = demoMangaPages.reduce((s, p) => s + p.panels.length, 0);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/demo/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Dashboard
        </Link>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{demoProject.title}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{demoProject.pitch}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>{demoProject.primaryGenre}</Badge>
          <Badge variant="outline">{demoProject.tone}</Badge>
          <Badge variant="secondary">{demoProject.contentRating}</Badge>
          <Badge variant="outline">{demoProject.visualStyle}</Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { icon: Users, label: "Personnages", value: demoProject.stats.characters },
          { icon: GitBranch, label: "Arcs", value: demoProject.stats.arcs },
          { icon: BookOpenText, label: "Chapitres", value: demoProject.stats.chapters },
          { icon: Sparkles, label: "Cases g\u00e9n\u00e9r\u00e9es", value: totalPanels },
          { icon: Wallet, label: "Tokens restants", value: "4 870" },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="border-border/60 bg-card/40">
            <CardContent className="flex items-center gap-3 p-4">
              <Icon className="h-5 w-5 text-accent" />
              <div>
                <p className="text-2xl font-semibold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progression */}
      <Card className="border-border/60 bg-card/40">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Progression de la s\u00e9rie</span>
            <span className="text-muted-foreground">{demoProject.stats.progress}%</span>
          </div>
          <div className="h-3 rounded-full bg-background/80">
            <div className="h-3 rounded-full bg-gradient-to-r from-violet-500 to-rose-500" style={{ width: `${demoProject.stats.progress}%` }} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        {/* Characters */}
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle>Cast principal</CardTitle>
            <CardDescription>{demoCharacters.length} personnages avec profil canonique complet.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {demoCharacters.map((c) => (
              <div key={c.id} className="rounded-xl border border-border/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.role}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]">{c.emotion}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{c.bio}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Arcs */}
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Arcs narratifs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {demoArcs.map((arc) => (
                <div key={arc.id} className="rounded-xl border border-border/60 p-4 text-sm">
                  <p className="font-medium">{arc.title}</p>
                  <p className="mt-1.5 text-muted-foreground">{arc.summary}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Wallet */}
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Ledger tokens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {demoTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{t.reason}</p>
                    <p className="text-xs text-muted-foreground">{t.type}</p>
                  </div>
                  <div className="text-right">
                    <p className={t.type === "purchase" ? "text-emerald-400" : "text-rose-400"}>
                      {t.type === "purchase" ? "+" : "-"}{t.amount}
                    </p>
                    <p className="text-[10px] text-muted-foreground">solde {t.balanceAfter}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-3">
            <Button asChild className="w-full" size="lg">
              <Link href="/demo/reader">
                <BookOpenText className="h-4 w-4" />
                Ouvrir le lecteur manga
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full" size="lg">
              <Link href="/demo/lab">
                <Wand2 className="h-4 w-4" />
                Lancer un chapitre sur mesure
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
