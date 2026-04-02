import Link from "next/link";
import { BookOpenText, GitBranch, Users, Wallet } from "lucide-react";
import { demoArcs, demoCharacters, demoProject, demoTransactions } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DemoProjectPage() {
  return (
    <div className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <div>
          <Link href="/demo/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← Dashboard démo
          </Link>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">{demoProject.title}</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{demoProject.pitch}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>{demoProject.primaryGenre}</Badge>
            <Badge variant="outline">{demoProject.intensityLayer}</Badge>
            <Badge variant="secondary">{demoProject.contentRating}</Badge>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-accent" />
                Personnages
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{demoProject.stats.characters} fiches canoniques.</CardContent>
          </Card>
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <GitBranch className="h-5 w-5 text-accent" />
                Arcs
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{demoProject.stats.arcs} arcs narratifs ouverts.</CardContent>
          </Card>
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpenText className="h-5 w-5 text-accent" />
                Chapitres
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{demoProject.stats.chapters} chapitres générés.</CardContent>
          </Card>
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="h-5 w-5 text-accent" />
                Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">4870 tokens restants sur 5000.</CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/60 bg-card/40">
            <CardHeader>
              <CardTitle>Cast principal</CardTitle>
              <CardDescription>Exemple de fiches personnages V3 visibles dans la démo.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {demoCharacters.map((character) => (
                <div key={character.id} className="rounded-xl border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{character.name}</p>
                      <p className="text-sm text-muted-foreground">{character.role}</p>
                    </div>
                    <Badge variant="outline">{character.emotion}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{character.bio}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-border/60 bg-card/40">
              <CardHeader>
                <CardTitle>Arcs narratifs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {demoArcs.map((arc) => (
                  <div key={arc.id} className="rounded-xl border border-border/60 p-4 text-sm">
                    <p className="font-medium">{arc.title}</p>
                    <p className="mt-2 text-muted-foreground">{arc.summary}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/40">
              <CardHeader>
                <CardTitle>Ledger tokens</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {demoTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{transaction.reason}</p>
                      <p className="text-muted-foreground">{transaction.type}</p>
                    </div>
                    <div className="text-right">
                      <p>{transaction.amount}</p>
                      <p className="text-xs text-muted-foreground">Solde {transaction.balanceAfter}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Button asChild className="w-full">
              <Link href="/demo/reader">Ouvrir le lecteur manga de démo</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
