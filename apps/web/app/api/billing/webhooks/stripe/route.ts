import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@manga-ai-studio/db";
import { creditPurchase } from "@manga-ai-studio/billing";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!secret || !key) {
    return NextResponse.json({ error: "not_configured" }, { status: 501 });
  }
  const stripe = new Stripe(key);
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "no_signature" }, { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.userId;
    const packCode = session.metadata?.packCode;
    const tokens = session.metadata?.tokensGranted ? Number(session.metadata.tokensGranted) : 0;
    if (userId && packCode && tokens > 0) {
      await prisma.stripeOrder.upsert({
        where: { stripeCheckoutSessionId: session.id },
        create: {
          userId,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
          packCode,
          amountPaid: session.amount_total ?? 0,
          currency: session.currency ?? "eur",
          tokensGranted: tokens,
          status: "completed",
          rawPayload: session as unknown as object,
        },
        update: { status: "completed", rawPayload: session as unknown as object },
      });
      await creditPurchase(prisma, userId, tokens, { stripeCheckoutSessionId: session.id, packCode });
    }
  }

  return NextResponse.json({ received: true });
}
