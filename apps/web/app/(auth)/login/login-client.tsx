"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LoginClient({ authDisabled }: { authDisabled: boolean }) {
  const searchParams = useSearchParams();
  const err = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
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
    if (!error) setSent(true);
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
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-border/80 bg-card/90 shadow-2xl shadow-violet-950/20">
        <CardHeader>
          <CardTitle className="text-2xl">Connexion</CardTitle>
          <CardDescription>Magic link par e-mail.</CardDescription>
        </CardHeader>
        <CardContent>
          {err ? <p className="mb-4 text-sm text-red-400">{err}</p> : null}
          {sent ? (
            <p className="text-sm text-muted-foreground">Vérifie ta boîte mail pour le lien de connexion.</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Envoi…" : "Recevoir le lien"}
              </Button>
            </form>
          )}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link href="/" className="text-accent hover:underline">
              ← Retour
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
