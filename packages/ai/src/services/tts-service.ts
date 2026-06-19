/**
 * TTS Service — Text-to-Speech pour les dialogues du lecteur manga.
 *
 * Génère des fichiers audio pour les bulles de dialogue, permettant une
 * expérience de lecture immersive avec des voix distinctes par personnage.
 *
 * Utilise l'API OpenAI TTS (tts-1 / tts-1-hd) pour la synthèse vocale.
 */

const TTS_ENDPOINT = "https://api.openai.com/v1/audio/speech";

export type TtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export interface TtsInput {
  text: string;
  voice: TtsVoice;
  speed?: number;
  model?: "tts-1" | "tts-1-hd";
}

export interface TtsResult {
  ok: boolean;
  audioUrl?: string;
  audioBuffer?: ArrayBuffer;
  error?: string;
}

const CHARACTER_VOICE_MAP: Record<string, TtsVoice> = {
  protagonist_male: "onyx",
  protagonist_female: "nova",
  antagonist_male: "echo",
  antagonist_female: "shimmer",
  mentor: "fable",
  ally_male: "alloy",
  ally_female: "nova",
  comic_relief: "alloy",
  narrator: "fable",
  default_male: "onyx",
  default_female: "nova",
};

/**
 * Choisit la voix TTS la plus appropriée pour un personnage.
 */
export function selectVoiceForCharacter(
  roleType: string | null,
  gender: string | null,
): TtsVoice {
  const role = (roleType ?? "default").toLowerCase().replace(/[^a-z_]/g, "_");
  const genderSuffix = gender === "female" ? "_female" : "_male";

  return (
    CHARACTER_VOICE_MAP[`${role}${genderSuffix}`] ??
    CHARACTER_VOICE_MAP[role] ??
    CHARACTER_VOICE_MAP[`default${genderSuffix}`] ??
    "alloy"
  );
}

/**
 * Génère un audio TTS via l'API OpenAI.
 * Retourne un ArrayBuffer contenant le fichier MP3.
 */
export async function generateSpeech(input: TtsInput): Promise<TtsResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY absente — TTS indisponible" };
  }

  try {
    const res = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model ?? "tts-1",
        input: input.text,
        voice: input.voice,
        speed: input.speed ?? 1.0,
        response_format: "mp3",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `TTS error ${res.status}: ${errText.slice(0, 200)}` };
    }

    const audioBuffer = await res.arrayBuffer();
    return { ok: true, audioBuffer };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "tts_failed";
    return { ok: false, error: msg };
  }
}

/**
 * Génère les dialogues audio pour un panel manga.
 */
export async function generatePanelAudio(
  bubbles: Array<{ speaker: string; text: string; voice: TtsVoice }>,
): Promise<Array<{ speaker: string; text: string; audio?: ArrayBuffer; error?: string }>> {
  const results = [];
  for (const bubble of bubbles) {
    if (!bubble.text || bubble.text.length < 2) {
      results.push({ speaker: bubble.speaker, text: bubble.text });
      continue;
    }
    const tts = await generateSpeech({ text: bubble.text, voice: bubble.voice });
    results.push({
      speaker: bubble.speaker,
      text: bubble.text,
      audio: tts.audioBuffer,
      error: tts.error,
    });
  }
  return results;
}
