import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@manga-ai-studio/db";
import { resolveCharacterIdentity, type CharacterIdentitySource } from "@manga-ai-studio/ai";
import { getAppUser } from "@/lib/auth/get-app-user";
import { notFound, unauthorized } from "@/lib/api-response";
import { getOwnedCharacter } from "@/lib/ownership";
import { computeCanonPackScore } from "@/lib/characters/compute-canon-pack-score";

type Ctx = { params: Promise<{ characterId: string }> };

function asObjectRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

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

  const raw = character as unknown as Record<string, unknown>;
  const identitySource: CharacterIdentitySource = {
    name: character.name,
    gender: typeof raw.gender === "string" ? raw.gender : null,
    appearance: typeof raw.appearance === "string" ? raw.appearance : null,
    hairColor: typeof raw.hairColor === "string" ? raw.hairColor : null,
    eyeColor: typeof raw.eyeColor === "string" ? raw.eyeColor : null,
    outfitDefault: typeof raw.outfitDefault === "string" ? raw.outfitDefault : null,
    roleType: typeof raw.roleType === "string" ? raw.roleType : null,
    emotionalState: typeof raw.emotionalState === "string" ? raw.emotionalState : null,
    traits: Array.isArray(raw.traits) ? (raw.traits as string[]) : null,
    flaws: Array.isArray(raw.flaws) ? (raw.flaws as string[]) : null,
    visualProfile: asObjectRecord(raw.visualProfile),
    bodyState: asObjectRecord(raw.bodyState),
    wardrobeProfile: asObjectRecord(raw.wardrobeProfile),
    continuityProfile: asObjectRecord(raw.continuityProfile),
    stableVisualDNA: asObjectRecord(raw.stableVisualDNA),
  };

  const identity = resolveCharacterIdentity(identitySource);

  const age = typeof raw.age === "number" ? raw.age : null;
  const biography = typeof raw.biography === "string" ? raw.biography : "";
  const objective = typeof raw.objective === "string" ? raw.objective : "";
  const fear = typeof raw.fear === "string" ? raw.fear : "";
  const trauma = typeof raw.trauma === "string" ? raw.trauma : "";
  const voiceRegister = typeof raw.voiceRegister === "string" ? raw.voiceRegister : "";
  const voiceSentenceLength = typeof raw.voiceSentenceLength === "string" ? raw.voiceSentenceLength : "";
  const voiceVocabularyStyle = typeof raw.voiceVocabularyStyle === "string" ? raw.voiceVocabularyStyle : "";
  const voiceFavoriteExpressions = Array.isArray(raw.voiceFavoriteExpressions) ? raw.voiceFavoriteExpressions : [];
  const voiceForbiddenExpressions = Array.isArray(raw.voiceForbiddenExpressions) ? raw.voiceForbiddenExpressions : [];

  const prompt = `Tu es un directeur artistique de manga.
À partir des données ci-dessous, génère 3 blocs JSON pour verrouiller l'identité visuelle et comportementale de ce personnage.

PERSONNAGE :
- Nom : ${identity.name}
- Genre : ${identity.gender ?? ""}${age ? ` — Âge : ${age}` : ""}
- Biographie : ${biography}
- Objectif : ${objective}
- Peur : ${fear}
- Trauma : ${trauma}
- Traits : ${identity.traits.join(", ")}
- Apparence : ${identity.appearanceText ?? ""}
- Cheveux : ${identity.hairColor ?? ""}
- Yeux : ${identity.eyeColor ?? ""}
- Visage : ${identity.faceShape ?? ""}
- Teint : ${identity.skinTone ?? ""}
- Silhouette : ${identity.silhouette ?? ""}
- Tenue par défaut : ${identity.outfit ?? ""}
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

    const updatedRaw = updated as unknown as Record<string, unknown>;
    const updatedIdentity = resolveCharacterIdentity({
      name: updated.name,
      gender: typeof updatedRaw.gender === "string" ? updatedRaw.gender : null,
      appearance: typeof updatedRaw.appearance === "string" ? updatedRaw.appearance : null,
      hairColor: typeof updatedRaw.hairColor === "string" ? updatedRaw.hairColor : null,
      eyeColor: typeof updatedRaw.eyeColor === "string" ? updatedRaw.eyeColor : null,
      outfitDefault: typeof updatedRaw.outfitDefault === "string" ? updatedRaw.outfitDefault : null,
      visualProfile: asObjectRecord(updatedRaw.visualProfile),
      stableVisualDNA: asObjectRecord(updatedRaw.stableVisualDNA),
      wardrobeProfile: asObjectRecord(updatedRaw.wardrobeProfile),
    });

    const score = computeCanonPackScore({
      ...updated,
      activeVisualRefCount: updated.visualRefs.length,
      resolvedHairColor: updatedIdentity.hairColor,
      resolvedEyeColor: updatedIdentity.eyeColor,
      resolvedAppearance: updatedIdentity.appearanceText,
      resolvedOutfit: updatedIdentity.outfit,
      resolvedGender: updatedIdentity.gender,
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
