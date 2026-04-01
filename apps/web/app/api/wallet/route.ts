import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

export async function GET() {
  const user = await getAppUser();
  if (!user) return unauthorized();
  let wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { userId: user.id, balance: 500, lifetimePurchased: 500, lifetimeSpent: 0, lifetimeRefunded: 0 },
    });
  }
  return NextResponse.json({ wallet });
}
