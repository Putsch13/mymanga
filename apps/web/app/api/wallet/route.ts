import { NextResponse } from "next/server";
import { getWalletSummary } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

export async function GET() {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { wallet, transactions } = await getWalletSummary(prisma, user.id);
  return NextResponse.json({ wallet, transactions });
}
