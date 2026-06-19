import { extractCharacterFingerprintFromRefs } from "@manga-ai-studio/ai";
import { prisma } from "@manga-ai-studio/db";

interface FingerprintInput {
  id: string;
  name: string;
  gender: string | null;
  appearance: string | null;
  hairColor: string | null;
  eyeColor: string | null;
}

export interface ExtractFingerprintArgs {
  character: FingerprintInput;
  visualProfile: Record<string, unknown>;
  bodyState: Record<string, unknown>;
  wardrobeProfile: Record<string, unknown>;
}

function normalizeGender(value: string | null): "male" | "female" | "other" {
  if (value === "male") return "male";
  if (value === "female") return "female";
  return "other";
}

/**
 * Best-effort — extraction puis persistance du CharacterFingerprint (Bloc 2).
 * Si l'extraction échoue, on log mais on ne propage pas l'erreur.
 */
export async function extractAndPersistFingerprint(
  args: ExtractFingerprintArgs,
): Promise<void> {
  const { character } = args;
  try {
    const allVisualRefs = await prisma.characterVisualRef.findMany({
      where: { characterId: character.id },
      select: { imageUrl: true, type: true, isPrimary: true },
      orderBy: { isPrimary: "desc" },
    });

    const fingerprint = await extractCharacterFingerprintFromRefs({
      characterId: character.id,
      characterName: character.name,
      gender: normalizeGender(character.gender),
      visualRefs: allVisualRefs.map((ref) => ({
        url: ref.imageUrl,
        type: ref.type,
        isPrimary: ref.isPrimary,
      })),
      visualProfile: args.visualProfile,
      bodyState: args.bodyState,
      wardrobeProfile: args.wardrobeProfile,
      appearance: character.appearance,
      hairColor: character.hairColor,
      eyeColor: character.eyeColor,
    });

    await prisma.character.update({
      where: { id: character.id },
      data: { characterFingerprint: fingerprint as never },
    });

    console.log(
      `[generate-visual] CharacterFingerprint extracted and persisted for ${character.name}`,
    );
  } catch (fpError) {
    console.error(
      `[generate-visual] Failed to extract fingerprint:`,
      fpError instanceof Error ? fpError.message : fpError,
    );
  }
}
