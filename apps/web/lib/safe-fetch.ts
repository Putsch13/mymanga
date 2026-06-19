/**
 * safeFetch — wrapper robuste pour tous les appels fetch côté client.
 * - Try/catch réseau
 * - Vérif res.ok + extraction message d'erreur serveur
 * - Retourne { ok, data, error } — jamais de throw non géré
 */
export async function safeFetch<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  try {
    const res = await fetch(url, options);
    let body: unknown;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    if (!res.ok) {
      const msg =
        typeof body === "object" && body !== null
          ? ((body as Record<string, unknown>).message ??
              (body as Record<string, unknown>).error ??
              `Erreur ${res.status}`)
          : `Erreur ${res.status}`;
      return { ok: false, error: String(msg), status: res.status };
    }
    return { ok: true, data: body as T };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur réseau";
    return { ok: false, error: msg };
  }
}
