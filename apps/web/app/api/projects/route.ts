import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";
import { slugify } from "@/lib/slug";

const createSchema = z.object({
  title: z.string().min(1),
  pitch: z.string().optional(),
  primaryGenre: z.string().optional(),
});

export async function GET() {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { settings: true, stylePacks: { take: 1, orderBy: { version: "desc" } } },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const body = createSchema.parse(await req.json());
  const base = slugify(body.title);
  let slug = base;
  let n = 0;
  while (await prisma.project.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      title: body.title,
      slug,
      pitch: body.pitch,
      primaryGenre: body.primaryGenre,
      settings: { create: {} },
      stylePacks: {
        create: {
          version: 1,
        },
      },
    },
    include: { stylePacks: true },
  });
  return NextResponse.json({ project });
}
