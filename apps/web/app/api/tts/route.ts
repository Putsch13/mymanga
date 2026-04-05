import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSpeech, selectVoiceForCharacter, type TtsVoice } from "@manga-ai-studio/ai";
import { getAppUser } from "@/lib/auth/get-app-user";
import { unauthorized } from "@/lib/api-response";

const bodySchema = z.object({
  text: z.string().min(1).max(500),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
  roleType: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  speed: z.number().min(0.5).max(2).optional(),
});

export async function POST(req: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const body = bodySchema.parse(await req.json());
  const voice: TtsVoice = body.voice ?? selectVoiceForCharacter(body.roleType ?? null, body.gender ?? null);

  const result = await generateSpeech({
    text: body.text,
    voice,
    speed: body.speed,
  });

  if (!result.ok || !result.audioBuffer) {
    return NextResponse.json({ error: result.error ?? "TTS indisponible" }, { status: 500 });
  }

  return new NextResponse(result.audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `inline; filename="speech.mp3"`,
    },
  });
}
