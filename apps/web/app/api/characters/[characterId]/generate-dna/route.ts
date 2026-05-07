import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@manga-ai-studio/db";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";
import { computeCanonPackScore } from "@/lib/characters/compute-canon-pack-score";

type Ctx = { params: Promise<{ characterId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getAppUser();
  if (!user) return unauthorized();
  const { characterId } = await ctx.params;
  const character = await getOwnedCharacter(user.id, characterId);
  if (!character) return notFound();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 503 },
    );
  }

  const appearance = character.appearance ?? "";
  const hairColor = character.hairColor ?? "";
  const eyeColor = character.eyeColor ?? "";
  const outfitDefault = character.outfitDefault ?? "";
  const biography = character.biography ?? "";
  const objective = character.objective ?? "";
  const fear = character.fear ?? "";
  const trauma = character.trauma ?? "";
  const traits = Array.isArray(character.traits) ? character.traits : [];
  const flaws = Array.isArray(character.flaws) ? character.flaws : [];
  const voiceRegister = character.voiceRegister ?? "";
  const voiceSentenceLength = character.voiceSentenceLength ?? "";
  const voiceVocabularyStyle = character.voiceVocabularyStyle ?? "";
  const voiceFavoriteExpressions = Array.isArray(character.voiceFavoriteExpressions)
    ? character.voiceFavoriteExpressions
    : [];
  const voiceForbiddenExpressions = Array.isArray(character.voiceForbiddenExpressions)
    ? character.voiceForbiddenExpressions
    : [];
  const gender = character.gender ?? "";
  const age = character.age ?? null;

  const prompt = `Tu es un directeur artistique de manga.
À partir des données ci-dessous, génère 3 blocs JSON pour verrouiller l'identité visuelle et comportementale de ce personnage.

PERSONNAGE :
- Nom : ${character.name}
- Genre : ${gender}${age ? ` — Âge : ${age}` : ""}
- Biographie : ${biography}
- Objectif : ${objective}
- Peur : ${fear}
- Trauma : ${trauma}
- Traits : ${traits.join(", ")}
- Défauts : ${flaws.join(", ")}
- Apparence : ${appearance}
- Cheveux : ${hairColor}
- Yeux : ${eyeColor}
- Tenue par défaut : ${outfitDefault}
- Registre vocal : ${voiceRegister}
- Longueur de phrase : ${voiceSentenceLength}
- Style vocabulaire : ${voiceVocabularyStyle}
- Expressions favorites : ${voiceFavoriteExpressions.join(", ")}
- Expressions interdites : ${voiceForbiddenExpressions.join(", ")}

Retourne UNIQUEMENT un JSON valide avec cette structure exacte (pas de markdown, pas de commentaire) :
{
  "stableVisualDNA": {
    "hairColor": "couleur précise",
    "eyeColor": "couleur précise",
    "faceShape": "forme du visage (ovale, carré, etc.)",
    "silhouette": "type de silhouette (athlétique, mince, etc.)",
    "skinTone": "teint",
    "distinctiveFeatures": ["cicatrices", "tatouages", "accessoires fixes..."],
    "defaultOutfit": "description tenue principale",
    "forbiddenVisualDrift": ["ce qui ne doit JAMAIS changer entre les pages"]
  },
  "stableSpeechDNA": {
    "register": "registre (formel, neutre, familier, etc.)",
    "sentenceLength": "court / moyen / long",
    "vocabularyStyle": "style de vocabulaire",
    "favoriteExpressions": ["expressions récurrentes"],
    "forbiddenExpressions": ["ce que ce personnage ne dirait JAMAIS"]
  },
  "stablePsycheDNA": {
    "coreDesire": "motivation profonde",
    "coreFear": "peur fondamentale",
    "internalLie": "croyance fausse que le personnage porte",
    "moralLine": "ligne morale qu'il ne franchirait pas",
    "fatalFlaw": "défaut fatal",
    "defaultEmotionalState": "état émotionnel de base",
    "typicalReaction": "comment il réagit sous pression"
  }
}`;

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "LLM returned invalid JSON", raw: raw.slice(0, 500) },
        { status: 502 },
      );
    }

    const stableVisualDNA = parsed.stableVisualDNA ?? {};
    const stableSpeechDNA = parsed.stableSpeechDNA ?? {};
    const stablePsycheDNA = parsed.stablePsycheDNA ?? {};

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: {
        stableVisualDNA: stableVisualDNA as object,
        stableSpeechDNA: stableSpeechDNA as object,
        stablePsycheDNA: stablePsycheDNA as object,
      },
      include: { visualRefs: { where: { archivedAt: null }, select: { id: true } } },
    });

    const score = computeCanonPackScore({
      ...updated,
      activeVisualRefCount: updated.visualRefs.length,
    });

    console.info(
      `[generate-dna] characterId=${characterId} name=${character.name} score=${score.score} complete=${score.complete}`,
    );

    return NextResponse.json({
      ok: true,
      characterId,
      canonPackScore: score,
      stableVisualDNA,
      stableSpeechDNA,
      stablePsycheDNA,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[generate-dna] error characterId=${characterId}`, msg);
    return NextResponse.json(
      { error: "DNA generation failed", detail: msg.slice(0, 200) },
      { status: 500 },
    );
  }
}
