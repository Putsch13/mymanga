/**
 * Génération d'embeddings via OpenAI et sanitisation du contenu RAG.
 *
 * `generateEmbedding` retourne `null` si la clé API n'est pas configurée
 * (fallback gracieux : la couche RAG bascule alors sur la recherche textuelle).
 */

const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export function sanitizeRagContent(content: string): string {
  return content
    .replace(/system\s*:/gi, "")
    .replace(/assistant\s*:/gi, "")
    .replace(/ignore previous instructions/gi, "")
    .trim()
    .slice(0, 4000);
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
    };
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}
