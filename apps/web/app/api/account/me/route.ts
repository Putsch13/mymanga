import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

export async function GET() {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { preferences: true, wallets: true },
  });

  return NextResponse.json({ user: fullUser });
}
