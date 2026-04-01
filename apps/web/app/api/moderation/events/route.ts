import { NextResponse } from "next/server";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

export async function GET() {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const events = await prisma.moderationEvent.findMany({
    where: user.role === "admin" ? undefined : { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ events });
}
