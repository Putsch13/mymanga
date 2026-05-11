import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";
import { toProxiedServerUrl } from "@/lib/images/proxy-url.server";

interface VisualRefShape {
  imageUrl: string;
}

/**
 * Sign + proxy la `imageUrl` du visualRef pour le client (P0.4 : helper central
 * — allowlist + HMAC).
 */
export async function buildVisualRefForClient<T extends VisualRefShape>(
  visualRef: T,
): Promise<T> {
  const signedImageUrl = await signSupabaseUrlIfNeeded(visualRef.imageUrl);
  const urlForClient = signedImageUrl ?? visualRef.imageUrl;
  const proxiedUrl = toProxiedServerUrl(urlForClient) ?? urlForClient;
  return { ...visualRef, imageUrl: proxiedUrl };
}
