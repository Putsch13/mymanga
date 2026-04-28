import { NextResponse } from "next/server";
import { z } from "zod";
import { decideImageRoute } from "@manga-ai-studio/ai";
import { estimateImageTokensFromRules } from "@manga-ai-studio/billing";
import { RENDERING_MODES, type RenderingMode } from "@manga-ai-studio/core";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

const modeSchema = z.enum(RENDERING_MODES as unknown as [string, ...string[]]);

const schema = z.object({
  mode: modeSchema,
  contentIntensityLayer: z.string(),
  isNewCharacter: z.boolean().optional(),
  hasCanonReferences: z.boolean().optional(),
  characterCountInScene: z.number().optional(),
  needsInpaint: z.boolean().optional(),
  needsPoseVariation: z.boolean().optional(),
  preferPhotorealCover: z.boolean().optional(),
  explicitBlocked: z.boolean().optional(),
  goreStylizedMature: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "dev_estimate_image_route_disabled",
        message:
          "Cette route est un outil de dev. En production, utilisez le flux studio / billing côté serveur.",
      },
      { status: 403 },
    );
  }
  const raw = schema.parse(await req.json());
  const routing = decideImageRoute({
    mode: raw.mode as RenderingMode,
    contentIntensityLayer: raw.contentIntensityLayer,
    isNewCharacter: raw.isNewCharacter ?? false,
    hasCanonReferences: raw.hasCanonReferences ?? false,
    characterCountInScene: raw.characterCountInScene ?? 1,
    needsInpaint: raw.needsInpaint ?? false,
    needsPoseVariation: raw.needsPoseVariation ?? false,
    preferPhotorealCover: raw.preferPhotorealCover ?? false,
    explicitBlocked: raw.explicitBlocked ?? false,
    goreStylizedMature: raw.goreStylizedMature ?? false,
  });

  if ("blocked" in routing) {
    return NextResponse.json({
      blocked: true,
      reason: routing.reason,
      textOnlyFallback: routing.textOnlyFallback,
      estimatedTokens: 0,
    });
  }

  const estimatedTokens = await estimateImageTokensFromRules(raw.mode as RenderingMode, routing.provider);
  return NextResponse.json({ routing, estimatedTokens });
}
