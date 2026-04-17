import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  existingCharacterNames: z.array(z.string()).optional().default([]),
});

export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  // P1-6 : rate limit — appel OpenAI direct
  const rl = await checkRateLimit(user.id, "character-ai-suggest");
  if (!rl.ok) {
    return NextResponse.json({ error: rl.message }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } });
  }

  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const body = schema.parse(await req.json());

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI non configuré" }, { status: 503 });
  }

  const systemPrompt = `Tu es un expert en création de personnages manga. Tu génères des suggestions de personnages cohérentes avec l'univers du projet.
Réponds UNIQUEMENT avec un JSON valide, sans markdown, sans explication.
Format : { "suggestions": [{ "name": string, "role": string, "appearance": string, "biography": string, "traits": string[] }] }`;

  const existingNames = body.existingCharacterNames.join(", ");
  const userPrompt = `Projet manga : "${project.title}"
Genre : ${project.primaryGenre ?? "non défini"}
Pitch : ${project.pitch ?? "non défini"}
Personnages existants : ${existingNames || "aucun"}

Génère 4 suggestions de personnages originaux et cohérents avec cet univers. Chaque personnage doit avoir un rôle différent (héros, antagoniste, mentor, soutien). Évite les noms déjà utilisés.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.9,
        max_tokens: 1200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[ai-suggest] OpenAI error: ${res.status} ${err}`);
      return NextResponse.json({ error: "Erreur OpenAI" }, { status: 502 });
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content ?? "{}";

    let parsed: { suggestions?: unknown[] };
    try {
      parsed = JSON.parse(content) as { suggestions?: unknown[] };
    } catch {
      console.error(`[ai-suggest] Failed to parse OpenAI response: ${content.slice(0, 200)}`);
      return NextResponse.json({ error: "Réponse IA invalide" }, { status: 502 });
    }

    console.log(`[ai-suggest] projectId=${projectId} suggestions=${Array.isArray(parsed.suggestions) ? parsed.suggestions.length : 0}`);
    return NextResponse.json({ ok: true, suggestions: parsed.suggestions ?? [] });
  } catch (err) {
    console.error(`[ai-suggest] Unexpected error:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erreur inattendue" }, { status: 500 });
  }
}
