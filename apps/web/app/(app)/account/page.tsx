import Link from "next/link";
import { Shield, Sparkles, UserRound, Wallet } from "lucide-react";
import { prisma } from "@manga-ai-studio/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, isUnlimitedAdminEmail } from "@/lib/auth/get-app-user";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  const unlimitedAdmin = isUnlimitedAdminEmail(user.email);
  const [wallet, fullUser] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.user.findUnique({
      where: { id: user.id },
      include: { preferences: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-black/20 px-6 py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge>Mon compte</Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight">Pilote ton accès, tes préférences et tes crédits.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Cet espace centralise ton statut utilisateur, ton niveau d&apos;accès, ton compte de crédits et les réglages de contenu mature pour ton studio manga.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/wallet">Voir mes crédits</Link>
            </Button>
            <Button asChild>
              <Link href="/lab">Ouvrir le labo</Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserRound className="h-5 w-5 text-accent" />
              Profil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Nom affiché</p>
              <p className="font-medium">{user.displayName ?? "Non défini"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{user.role}</Badge>
              {unlimitedAdmin ? <Badge className="bg-emerald-950/40 text-emerald-300">admin illimité</Badge> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="h-5 w-5 text-amber-300" />
              Crédits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Solde visible</p>
              <p className="text-3xl font-semibold">{unlimitedAdmin ? "Illimité" : wallet?.balance ?? 0}</p>
            </div>
            <p className="text-muted-foreground">
              {unlimitedAdmin
                ? "Ce compte bypass les réservations de crédits pour tester tous les flux de génération."
                : "Le solde descend au rythme des générations. Les packs te permettent de poursuivre tes séries."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5 text-violet-300" />
              Préférences contenu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">Age gate</p>
              <p className="font-medium">{fullUser?.ageVerifiedAt ? "18+ validé" : "Non validé"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Contenu mature</p>
              <p className="font-medium">{fullUser?.preferences?.matureContentEnabled ? "Activé" : "Désactivé"}</p>
            </div>
            <p className="text-muted-foreground">
              Le labo V4 te laissera piloter clairement les garde-fous de violence, sensualité et intensité narrative.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-rose-300" />
            Raccourcis utiles
          </CardTitle>
          <CardDescription>Pour repartir immédiatement dans le bon flux produit.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/mangas">Ma bibliothèque</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/lab">Configurer dans le labo</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/projects/new">Créer un manga</Link>
          </Button>
          {user.role === "admin" ? (
            <Button asChild variant="outline">
              <Link href="/admin">Ouvrir l&apos;admin</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
