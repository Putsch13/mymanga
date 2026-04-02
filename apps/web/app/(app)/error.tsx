"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isDbError =
    error.message?.includes("Can't reach database") ||
    error.message?.includes("Connection refused") ||
    error.message?.includes("ECONNREFUSED") ||
    error.message?.includes("P1001") ||
    error.message?.includes("P1002");

  return (
    <div className="min-h-[70vh] px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <AlertTriangle className="h-6 w-6 text-amber-400" />
              {isDbError ? "Base de données inaccessible" : "Erreur de chargement"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm text-muted-foreground">
            {isDbError ? (
              <p>
                La connexion à la base de données a échoué. Vérifie que <code className="rounded bg-background/60 px-1 py-0.5">DATABASE_URL</code> est bien
                configuré sur Render et que la base Supabase est active.
              </p>
            ) : (
              <p>
                La page n&apos;a pas pu se charger. Tu peux réessayer ou tester l&apos;interface via la démo publique en attendant.
              </p>
            )}
            {error.digest ? (
              <p className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 font-mono text-xs">
                Digest: {error.digest}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={reset}>
                <RefreshCcw className="h-4 w-4" />
                Réessayer
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/demo">Ouvrir la démo sans connexion</Link>
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link href="/login">Retour à la connexion</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
