import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedProject } from "@/lib/ownership";
import { checkRateLimit } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  name: z.string().min(1),
  brief: z.string().max(600).optional().default(""),
  gender: z.enum(["male", "female"]).optional(),
  role: z.string().optional(),
});

/**
 * POST /api/projects/[id]/characters/ai-fill
 *
 * L'IA complète la FICHE VISUELLE d'un personnage à partir d'un nom + d'une
 * brève description. Renvoie exactement les champs du formulaire visuel
 * (hairColor, hairStyle, eyeColor, eyeShape, skinTone, faceShape, build,
 * outfit, markers, + gender/age si déductibles) pour alimenter le prompt Fal.
 *
 * Objectif : l'utilisateur tape "Suko, jeune samouraï taciturne" et l'IA
 * remplit tous les traits cohérents — zéro champ vide pour la génération.
 */
export async function POST(req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const rl = await checkRateLimit(user.id, "character-ai-suggest");
  if (!rl.ok) {
    return NextResponse.json(
      { error: rl.message },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const { id: projectId } = await ctx.params;
  const project = await getOwnedProject(user.id, projectId);
  if (!project) return notFound();

  const body = schema.parse(await req.json());

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI non configuré" }, { status: 503 });
  }

  const systemPrompt = `Tu es directeur artistique manga. Tu conçois la FICHE VISUELLE d'un personnage pour une génération d'image cohérente.
Réponds UNIQUEMENT en JSON valide (sans markdown, sans texte autour), avec EXACTEMENT ces clés :
{
  "gender": "male" | "female",
  "age": number,
  "hairColor": string,   // ex: "noir corbeau", "blond cendré"
  "hairStyle": string,   // ex: "mi-longs hérissés", "queue de cheval haute"
  "eyeColor": string,
  "eyeShape": string,    // ex: "en amande perçants"
  "skinTone": string,    // ex: "pâle", "mate hâlée"
  "faceShape": string,   // ex: "anguleux", "ovale doux"
  "build": string,       // morphologie, ex: "athlétique élancé", "massif"
  "outfit": string,      // tenue par défaut détaillée
  "markers": string      // cicatrices/tatouages permanents, "" si aucun
}
Règles : reste cohérent avec le genre et l'univers. Sois concret et visuel (pas de psychologie). Champs courts (2-6 mots). Le genre fourni par l'utilisateur prime.`;

  const userPrompt = `Univers : "${project.title}" — genre ${project.primaryGenre ?? "manga"}, ton ${project.tone ?? "non défini"}.
Personnage à habiller visuellement :
- Nom : ${body.name}
${body.gender ? `- Sexe (imposé) : ${body.gender}` : ""}
${body.role ? `- Rôle : ${body.role}` : ""}
- Description libre : ${body.brief || "(aucune — invente une apparence marquante et cohérente)"}

Remplis TOUS les champs visuels pour une fiche de personnage manga stable.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        // Configurable : pose OPENAI_CHARACTER_FILL_MODEL dans Render pour un
        // modèle plus puissant (meilleure cohérence de fiche).
        model: process.env.OPENAI_CHARACTER_FILL_MODEL?.trim() || "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[ai-fill] OpenAI error: ${res.status} ${err}`);
      return NextResponse.json({ error: "Erreur OpenAI" }, { status: 502 });
    }

    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      console.error(`[ai-fill] parse failed: ${content.slice(0, 200)}`);
      return NextResponse.json({ error: "Réponse IA invalide" }, { status: 502 });
    }

    const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
    const fill = {
      gender: parsed.gender === "male" || parsed.gender === "female" ? parsed.gender : (body.gender ?? ""),
      age: typeof parsed.age === "number" && parsed.age > 0 ? String(Math.round(parsed.age)) : "",
      hairColor: str(parsed.hairColor),
      hairStyle: str(parsed.hairStyle),
      eyeColor: str(parsed.eyeColor),
      eyeShape: str(parsed.eyeShape),
      skinTone: str(parsed.skinTone),
      faceShape: str(parsed.faceShape),
      build: str(parsed.build),
      outfit: str(parsed.outfit),
      markers: str(parsed.markers),
    };

    console.log(`[ai-fill] projectId=${projectId} name="${body.name}" filled`);
    return NextResponse.json({ ok: true, fill });
  } catch (err) {
    console.error(`[ai-fill] unexpected:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erreur inattendue" }, { status: 500 });
  }
}
