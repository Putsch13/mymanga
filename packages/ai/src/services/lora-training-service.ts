/**
 * LoRA Training Service — fal-ai/flux-lora-fast-training
 *
 * Entraîne un modèle LoRA personnalisé à partir des images de référence d'un personnage.
 * Le modèle résultant est utilisé pour générer des images ultra-fidèles du personnage.
 */

const FAL_LORA_TRAINING = "https://fal.run/fal-ai/flux-lora-fast-training";

export interface LoraTrainingInput {
  characterName: string;
  triggerWord: string;
  imageUrls: string[];
  /** Nombre de steps d'entraînement (200-1000, défaut 300 pour speed) */
  steps?: number;
}

export interface LoraTrainingResult {
  ok: boolean;
  loraUrl?: string;
  configUrl?: string;
  error?: string;
}

/**
 * Lance un entraînement LoRA via fal-ai/flux-lora-fast-training.
 * Retourne l'URL des poids du modèle entraîné.
 */
export async function trainCharacterLora(input: LoraTrainingInput): Promise<LoraTrainingResult> {
  const apiKey = process.env.FAL_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "FAL_KEY absente — impossible de lancer l'entraînement LoRA" };
  }

  if (input.imageUrls.length < 3) {
    return { ok: false, error: "Au moins 3 images de référence sont nécessaires pour entraîner un LoRA" };
  }

  const body = {
    images_data_url: input.imageUrls.slice(0, 20).map((url) => ({
      url,
      caption: `${input.triggerWord}, ${input.characterName}, manga character, consistent design`,
    })),
    trigger_word: input.triggerWord,
    steps: input.steps ?? 300,
    learning_rate: 0.0001,
    rank: 16,
    is_style: false,
    is_input_format_already_preprocessed: false,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600_000);

    const res = await fetch(FAL_LORA_TRAINING, {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `fal training error ${res.status}: ${text.slice(0, 300)}` };
    }

    const data = JSON.parse(text) as {
      diffusers_lora_file?: { url: string };
      config_file?: { url: string };
    };

    const loraUrl = data.diffusers_lora_file?.url;
    if (!loraUrl) {
      return { ok: false, error: "Pas d'URL LoRA dans la réponse FAL" };
    }

    return {
      ok: true,
      loraUrl,
      configUrl: data.config_file?.url,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "lora_training_failed";
    console.error(`[lora-training] error: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Construit le trigger word unique pour un personnage.
 */
export function buildTriggerWord(characterName: string, projectId: string): string {
  const clean = characterName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  const hash = projectId.slice(-4);
  return `${clean}_${hash}`;
}
