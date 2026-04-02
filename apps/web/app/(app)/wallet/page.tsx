"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const packs = [
  { code: "starter" as const, label: "Starter", tokens: 500 },
  { code: "creator" as const, label: "Creator", tokens: 1500 },
  { code: "studio" as const, label: "Studio", tokens: 5000 },
  { code: "pro_saga" as const, label: "Pro Saga", tokens: 15000 },
];

export default function WalletPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<
    Array<{
      id: string;
      type: string;
      amount: number;
      reason: string;
      createdAt: string;
      balanceAfter: number;
    }>
  >([]);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((d) => {
        setBalance(d.wallet?.balance ?? 0);
        setTransactions(d.transactions ?? []);
        setLoadError(null);
      })
      .catch(() => {
        setBalance(null);
        setLoadError("Impossible de charger le wallet pour le moment.");
      });
  }, []);

  async function buy(packCode: (typeof packs)[number]["code"]) {
    setCheckoutLoading(true);
    setMessage(null);
    const res = await fetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packCode }),
    });
    const data = await res.json();
    setCheckoutLoading(false);
    if (data.url) window.location.href = data.url;
    else {
      setMessage(
        data.error === "stripe_not_configured"
          ? "Stripe n'est pas encore branché sur cet environnement de test."
          : data.message ?? "Impossible de lancer l'achat pour le moment.",
      );
    }
  }

  return (
    <div className="space-y-10">
      <div className="rounded-[2rem] border border-border/60 bg-black/20 px-6 py-6">
        <h1 className="text-3xl font-semibold">Crédits</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
          Les crédits servent à lancer les générations. L’utilisateur teste d’abord avec sa réserve de bienvenue, puis rachète pour poursuivre sa série.
        </p>
      </div>
      <Card className="max-w-md border-border/60 bg-gradient-to-br from-card/80 to-violet-950/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20">
              <Coins className="h-6 w-6 text-accent" />
            </span>
            <div>
              <CardDescription>Solde</CardDescription>
              <CardTitle className="text-4xl font-semibold tabular-nums text-accent">{balance ?? "—"}</CardTitle>
            </div>
          </div>
        </CardHeader>
      </Card>
      {loadError ? <p className="text-sm text-red-400">{loadError}</p> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      <div>
        <h2 className="mb-4 text-lg font-medium">Packs Stripe</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packs.map((p) => (
            <Card key={p.code} className="border-border/60 bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.label}</CardTitle>
                <CardDescription>{p.tokens} tokens</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" className="w-full" disabled={checkoutLoading} onClick={() => buy(p.code)}>
                  Acheter
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-lg">Historique du ledger</CardTitle>
          <CardDescription>Réservations, débits, achats et remboursements.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {transactions.length > 0 ? (
            transactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{transaction.reason}</p>
                  <p className="text-muted-foreground">{new Date(transaction.createdAt).toLocaleString("fr-FR")}</p>
                </div>
                <div className="text-right">
                  <p className={transaction.type === "refund" || transaction.type === "purchase" ? "text-emerald-400" : "text-foreground"}>
                    {transaction.type === "refund" || transaction.type === "purchase" ? "+" : "-"}
                    {transaction.amount}
                  </p>
                  <p className="text-xs text-muted-foreground">Solde {transaction.balanceAfter}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Aucune transaction pour l’instant.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
