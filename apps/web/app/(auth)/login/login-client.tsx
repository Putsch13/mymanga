"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { KeyRound, Mail, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginClient({ authDisabled }: { authDisabled: boolean }) {
  const searchParams = useSearchParams();
  const err = searchParams.get("error");
  const nextPath = searchParams.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "magic">("signin");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [diag, setDiag] = useState<null | {
    authDisabled: boolean;
    hasSupabaseUrl: boolean;
    hasSupabaseAnonKey: boolean;
    hasDatabaseUrl: boolean;
    hasFalKey: boolean;
    hasOpenAI: boolean;
    hasInngestEventKey: boolean;
    hasInngestSigningKey: boolean;
  }>(null);

  async function loadDiagnostics() {
    try {
      const res = await fetch("/api/diagnostics/public", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { env?: typeof diag };
      if (json?.env) setDiag(json.env as never);
    } catch {
      // ignore
    }
  }

  async function onMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      setLoading(false);
      return;
    }
    const supabase = createBrowserClient(supabaseUrl, supabaseKey);
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    setLoading(false);
    if (!error) {
      setSent(true);
      setMessage("Le magic link a été demandé. Vérifie ta boîte mail et tes spams.");
      return;
    }
    setMessage(error.message);
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setSent(false);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      setLoading(false);
      return;
    }

    const supabase = createBrowserClient(supabaseUrl, supabaseKey);
    const origin = window.location.origin;

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      setLoading(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      if (data.session) {
        window.location.href = nextPath;
        return;
      }
      setMessage(
        "Compte créé. Si la confirmation email est activée dans Supabase, valide d'abord ton email avant de te connecter. Sinon, reconnecte-toi directement.",
      );
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      if (error.message.toLowerCase().includes("invalid login credentials")) {
        setMessage(
          "Identifiants invalides. Si tu viens juste de créer ton compte, vérifie si Supabase demande d'abord une confirmation email.",
        );
        return;
      }
      setMessage(error.message);
      return;
    }
    window.location.href = nextPath;
  }

  if (authDisabled) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md border-border/80 bg-card/90">
          <CardHeader>
            <CardTitle>Mode développement</CardTitle>
            <CardDescription>AUTH_DISABLED est actif — accès direct au studio.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" className="mb-3 w-full" onClick={loadDiagnostics}>
              Diagnostiquer la config
            </Button>
            {diag ? (
              <div className="mb-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                <p>AUTH_DISABLED: {String(diag.authDisabled)}</p>
                <p>Supabase: {diag.hasSupabaseUrl && diag.hasSupabaseAnonKey ? "OK" : "MANQUANT"}</p>
                <p>DB: {diag.hasDatabaseUrl ? "OK" : "MANQUANT"}</p>
                <p>FAL_KEY: {diag.hasFalKey ? "OK" : "MANQUANT"}</p>
                <p>OPENAI_API_KEY: {diag.hasOpenAI ? "OK" : "MANQUANT"}</p>
                <p>Inngest: {diag.hasInngestEventKey && diag.hasInngestSigningKey ? "OK" : "MANQUANT"}</p>
              </div>
            ) : null}
            <Button asChild className="w-full">
              <Link href="/dashboard">Ouvrir le studio</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md border-border/80 bg-card/90">
          <CardHeader>
            <CardTitle>Configuration manquante</CardTitle>
            <CardDescription>
              Ajoutez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sur Render, ou AUTH_DISABLED=true uniquement pour des tests locaux.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" className="w-full" onClick={loadDiagnostics}>
              Diagnostiquer la config
            </Button>
            {diag ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                <p>AUTH_DISABLED: {String(diag.authDisabled)}</p>
                <p>Supabase URL: {String(diag.hasSupabaseUrl)}</p>
                <p>Supabase ANON: {String(diag.hasSupabaseAnonKey)}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.16),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.12),transparent_22%)]" />
      <div className="relative grid w-full max-w-6xl gap-8 lg:grid-cols-[1fr_440px]">
        <section className="hidden rounded-[2rem] border border-border/60 bg-black/20 p-10 lg:block">
          <div className="max-w-xl">
            <div className="flex flex-wrap gap-2">
              <Badge>Creation manga</Badge>
              <Badge variant="outline">Webtoon premium</Badge>
              <Badge variant="outline">Continuite canonique</Badge>
            </div>
            <h1 className="mt-6 text-5xl font-semibold leading-tight tracking-tight">
              Lance ton <span className="text-gradient">studio manga</span> sur une vraie base SaaS.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-muted-foreground">
              Cree tes personnages, structure ton univers, genere tes chapitres, illustre-les, puis fais evoluer ta serie avec une memoire de continuite
              et un lecteur manga premium.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
                <p className="text-lg font-semibold">Projet complet</p>
                <p className="mt-2 text-sm text-muted-foreground">Bible, arcs, personnages, relations, chapitres, panels et exports.</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
                <p className="text-lg font-semibold">Experience premium</p>
                <p className="mt-2 text-sm text-muted-foreground">Concu pour vendre une plateforme de creation, pas une simple demo technique.</p>
              </div>
            </div>
          </div>
        </section>

        <Card className="w-full border-border/80 bg-card/90 shadow-2xl shadow-violet-950/20">
        <CardHeader>
          <CardTitle className="text-2xl">Connexion et creation de compte</CardTitle>
          <CardDescription>Choisis ton mode d&apos;entree : mot de passe classique ou magic link.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Accès compte obligatoire</p>
            <p className="mt-2">Le produit fonctionne désormais en vrai mode SaaS : soit tu as un compte, soit tu crées ton compte, mais il n&apos;y a plus de masque démo public.</p>
          </div>
          <div className="mb-6 grid grid-cols-3 gap-2">
            <Button type="button" variant={mode === "signin" ? "default" : "outline"} size="sm" onClick={() => setMode("signin")}>
              <KeyRound className="h-4 w-4" />
              Connexion
            </Button>
            <Button type="button" variant={mode === "signup" ? "default" : "outline"} size="sm" onClick={() => setMode("signup")}>
              <Sparkles className="h-4 w-4" />
              Compte
            </Button>
            <Button type="button" variant={mode === "magic" ? "default" : "outline"} size="sm" onClick={() => setMode("magic")}>
              <Mail className="h-4 w-4" />
              Magic link
            </Button>
          </div>

          {err ? <p className="mb-4 text-sm text-red-400">{err}</p> : null}
          {message ? <p className="mb-4 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground">{message}</p> : null}

          {mode === "magic" && sent ? (
            <p className="text-sm text-muted-foreground">Vérifie ta boîte mail pour le lien de connexion.</p>
          ) : null}

          {mode === "magic" ? (
            <form onSubmit={onMagicLinkSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-magic">E-mail</Label>
                <Input
                  id="email-magic"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="bg-background/50"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Envoi…" : "Recevoir le lien"}
              </Button>
            </form>
          ) : (
            <form onSubmit={onPasswordSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="bg-background/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 caracteres minimum"
                  className="bg-background/50"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? "Traitement…"
                  : mode === "signup"
                    ? "Creer mon compte"
                    : "Se connecter"}
              </Button>
            </form>
          )}

          <div className="mt-6 rounded-2xl border border-border/60 bg-background/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Conseil de configuration</p>
            <p className="mt-2">
              Si les emails Supabase n&apos;arrivent pas, utilise d&apos;abord la création de compte par mot de passe. En production, l&apos;accès se fait via un vrai compte utilisateur.
            </p>
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/" className="text-accent hover:underline">
              ← Retour a l&apos;accueil
            </Link>
          </p>
        </CardContent>
        </Card>
      </div>
    </div>
  );
}
