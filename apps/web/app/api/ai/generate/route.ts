import { NextResponse } from "next/server";
import { z } from "zod";
import { RENDERING_MODES, type RenderingMode } from "@manga-ai-studio/core";
import { decideImageRoute, runRoutedImageGeneration } from "@manga-ai-studio/ai";
import { estimateImageTokens, reserveTokens } from "@manga-ai-studio/billing";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

const modeSchema = z.enum(RENDERING_MODES as unknown as [string, ...string[]]);

const bodySchema = z.object({
  mode: modeSchema,
  prompt: z.string().min(3),
  contentIntensityLayer: z.string().default("GENERAL_SAFE"),
  hasCanonReferences: z.boolean().optional(),
  isNewCharacter: z.boolean().optional(),
  needsInpaint: z.boolean().optional(),
  needsPoseVariation: z.boolean().optional(),
  preferPhotorealCover: z.boolean().optional(),
  goreStylizedMature: z.boolean().optional(),
  projectId: z.string().optional(),
});

export async function POST(req: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const body = bodySchema.parse(await req.json());
  const mode = body.mode as RenderingMode;

  const ctx = {
    mode,
    contentIntensityLayer: body.contentIntensityLayer,
    isNewCharacter: body.isNewCharacter ?? false,
    hasCanonReferences: body.hasCanonReferences ?? false,
    characterCountInScene: 1,
    needsInpaint: body.needsInpaint ?? false,
    needsPoseVariation: body.needsPoseVariation ?? false,
    preferPhotorealCover: body.preferPhotorealCover ?? false,
    explicitBlocked: false,
    goreStylizedMature: body.goreStylizedMature ?? false,
  };

  const routing = decideImageRoute(ctx);
  if ("blocked" in routing) {
    return NextResponse.json({ blocked: true, reason: routing.reason }, { status: 422 });
  }
  const cost = estimateImageTokens(mode, routing.provider);
  const reserved = await reserveTokens(prisma, user.id, cost);
  if (!reserved.ok) {
    return NextResponse.json({ error: "insufficient_tokens", needed: cost }, { status: 402 });
  }

  try {
    const out = await runRoutedImageGeneration(ctx, {
      mode,
      positivePrompt: body.prompt,
      width: 1024,
      height: 768,
    });
    if (!out.ok) {
      return NextResponse.json({ blocked: true, reason: out.reason }, { status: 422 });
    }
    return NextResponse.json({
      imageUrl: out.result.imageUrl,
      provider: out.result.provider,
      model: out.routing.model,
      workflow: out.routing.workflow,
      tokensCharged: cost,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur génération";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
