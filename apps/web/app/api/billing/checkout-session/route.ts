import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { createCheckoutSession, getPackDefinition } from "@manga-ai-studio/billing";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

const bodySchema = z.object({
  packCode: z.enum(["starter", "creator", "studio", "pro_saga"]),
});

export async function POST(req: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const body = bodySchema.parse(await req.json());
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "stripe_not_configured", mock: true, pack: body.packCode }, { status: 501 });
  }
  const stripe = new Stripe(secret);
  if (!getPackDefinition(body.packCode)) {
    return NextResponse.json({ error: "unknown_pack" }, { status: 400 });
  }
  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await createCheckoutSession({
    stripe,
    userId: user.id,
    email: user.email,
    packCode: body.packCode,
    successUrl: `${origin}/wallet?success=1`,
    cancelUrl: `${origin}/wallet?canceled=1`,
  });
  return NextResponse.json({ url: session.url });
}
