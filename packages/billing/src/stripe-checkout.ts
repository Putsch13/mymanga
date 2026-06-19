import Stripe from "stripe";

const PACKS: Record<string, { tokens: number; priceId?: string; amountCents: number }> = {
  starter: { tokens: 500, amountCents: 999 },
  creator: { tokens: 1500, amountCents: 2499 },
  studio: { tokens: 5000, amountCents: 6999 },
  pro_saga: { tokens: 15000, amountCents: 19999 },
};

export function getPackDefinition(packCode: string) {
  return PACKS[packCode] ?? null;
}

export async function createCheckoutSession(params: {
  stripe: Stripe;
  userId: string;
  email: string;
  packCode: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string | null }> {
  const pack = getPackDefinition(params.packCode);
  if (!pack) throw new Error("Unknown pack");

  const session = await params.stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.email,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: `Pack ${params.packCode}`, description: `${pack.tokens} tokens` },
          unit_amount: pack.amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: { userId: params.userId, packCode: params.packCode, tokensGranted: String(pack.tokens) },
  });

  return { url: session.url };
}
