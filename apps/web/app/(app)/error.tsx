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
  const msg = error.message ?? "";
  const isDbError =
    msg.includes("Can't reach database") ||
    msg.includes("Connection refused") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("P1001") ||
    msg.includes("P1002");
  const isMigrationError =
    msg.includes("column") ||
    msg.includes("does not exist") ||
    msg.includes("Unknown arg") ||
    msg.includes("P2002") ||
    msg.includes("P2003") ||
    msg.includes("P2010") ||
    msg.includes("P2025");

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
                La connexion à la base de données a échoué. Vérifie que la base est active et accessible.
              </p>
            ) : isMigrationError ? (
              <p>
                La base de données n&apos;est pas à jour avec la dernière version de l&apos;application.
                Une migration est nécessaire (contacte l&apos;administrateur).
              </p>
            ) : (
              <p>
                La page n&apos;a pas pu se charger. Tu peux réessayer ou revenir à l&apos;écran de connexion.
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
