import { signSupabaseUrlIfNeeded } from "@/lib/images/sign-supabase-url";
import { toProxiedServerUrl } from "@/lib/images/proxy-url.server";

interface KeyframeMutable {
  imageUrl: string | null;
}

interface ImageMutable {
  imageUrl: string | null;
  persistedUrl?: string | null;
}

interface SceneMutable {
  keyframes: KeyframeMutable[];
  images: ImageMutable[];
}

export async function signAndProxySceneImages(scenes: SceneMutable[]): Promise<{
  signedCount: number;
  proxiedCount: number;
}> {
  let signedCount = 0;
  let proxiedCount = 0;

  await Promise.all(
    scenes.flatMap((scene) => [
      ...scene.keyframes.map(async (keyframe) => {
        const original = keyframe.imageUrl;
        const signed = await signSupabaseUrlIfNeeded(keyframe.imageUrl);
        keyframe.imageUrl = toProxiedServerUrl(signed ?? original);
      }),
      ...scene.images.map(async (img) => {
        const original = img.imageUrl;
        const signed = await signSupabaseUrlIfNeeded(img.imageUrl);
        if (signed !== original) signedCount++;
        const proxied = toProxiedServerUrl(signed ?? original);
        if (proxied && proxied !== (signed ?? original)) proxiedCount++;
        img.imageUrl = proxied ?? signed ?? original;
        if (img.persistedUrl) {
          const ps = await signSupabaseUrlIfNeeded(img.persistedUrl ?? null);
          img.persistedUrl =
            toProxiedServerUrl(ps ?? img.persistedUrl) ?? img.persistedUrl;
        }
      }),
    ]),
  );

  return { signedCount, proxiedCount };
}
