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
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((d) => setBalance(d.wallet?.balance ?? 0))
      .catch(() => setBalance(0));
  }, []);

  async function buy(packCode: (typeof packs)[number]["code"]) {
    setCheckoutLoading(true);
    const res = await fetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packCode }),
    });
    const data = await res.json();
    setCheckoutLoading(false);
    if (data.url) window.location.href = data.url;
    else alert(data.error === "stripe_not_configured" ? "Stripe non configuré — voir DEPLOYMENT.md" : JSON.stringify(data));
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold">Wallet</h1>
        <p className="text-muted-foreground mt-2 text-sm">Ledger interne — chaque génération débite des tokens.</p>
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
    </div>
  );
}
