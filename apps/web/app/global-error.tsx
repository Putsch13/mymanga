"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-background text-foreground">
        <main className="flex min-h-screen items-center justify-center px-6 py-12">
          <div className="w-full max-w-2xl rounded-3xl border border-border/60 bg-card/50 p-8">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
              <h1 className="text-2xl font-semibold">Erreur de chargement</h1>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Le site a rencontré une erreur côté serveur. Tu peux réessayer, ou ouvrir directement la démo publique sans connexion.
            </p>
            {error.digest ? <p className="mt-4 rounded-lg border border-border/60 bg-background/60 px-3 py-2 font-mono text-xs">Digest: {error.digest}</p> : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" onClick={reset}>
                Réessayer
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/demo">Démo publique</Link>
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
