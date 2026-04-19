import type { PrismaClient } from "@manga-ai-studio/db";
import { createHash } from "node:crypto";
import { z } from "zod";

// ─── Versioning ──────────────────────────────────────────────────────────
//
// P1.2 — Le `SPECIES_ARCHETYPE_SCHEMA_VERSION` est bumped quand le shape de
// `SpeciesVisualTraits` change. Les rows persistées avec un schemaVersion
// inférieur peuvent être régénérées / migrées par un job ultérieur.
//
// Contrat de versioning :
//   - 1 : shape initial (morphology/skinTexture/.../promptFragment).
export const SPECIES_ARCHETYPE_SCHEMA_VERSION = 1;

// ─── Zod schema pour la réponse AI ───────────────────────────────────────

const speciesVisualTraitsSchema = z
  .object({
    morphology: z.string().min(3).max(500),
    skinTexture: z.string().min(3).max(300),
    distinctiveMarkers: z
      .array(z.string().min(2).max(200))
      .min(1)
      .max(6),
    colorPalette: z.string().min(3).max(300),
    heightProfile: z.string().min(3).max(300),
    clothingStyle: z.string().min(3).max(300),
    promptFragment: z.string().min(3).max(500),
  })
  .strict();

export type SpeciesVisualTraits = z.infer<typeof speciesVisualTraitsSchema>;

// ─── Utilitaires ─────────────────────────────────────────────────────────

function normalizeSpeciesLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

/**
 * P1.2 — Hash stable d'un prompt (SHA-256 hex). Permet de détecter :
 *   - quand le prompt du resolver change → invalider la row en cache,
 *   - quand deux projets partagent la même définition d'espèce,
 *   - quand un utilisateur triche en réinjectant manuellement des traits.
 */
export function computePromptHash(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}

export function detectSpeciesInDescription(description: string): string | null {
  const desc = description.toLowerCase();
  const patterns = [
    /hommes?\s+([\w-]+)/,
    /femmes?\s+([\w-]+)/,
    /êtres?\s+([\w-]+)/,
    /peuple\s+(?:des?\s+)?([\w-]+)/,
    /race\s+(?:des?\s+)?([\w-]+)/,
    /clan\s+(?:des?\s+)?([\w-]+)/,
    /tribu\s+(?:des?\s+)?([\w-]+)/,
    /([\w-]+)-(?:men|folk|kin|born)/,
  ];
  for (const pattern of patterns) {
    const match = desc.match(pattern);
    if (match?.[1] && match[1].length > 2) {
      return match[0].trim();
    }
  }
  return null;
}

/**
 * P1.2 — Parse + validation STRICTE d'une réponse AI via Zod. Exporté pour
 * pouvoir valider isolément dans les tests.
 *
 * Stratégie :
 *   1. Strip des fences ```json``` éventuelles.
 *   2. JSON.parse → si ça échoue, on renvoie `{ ok: false, reason: "json_parse" }`.
 *   3. Zod strict parse → si ça échoue, `{ ok: false, reason: "schema_mismatch" }`.
 *
 * NB : pas de fallback silencieux. Le caller décide du fallback (défaut local
 * vs rejet explicite) pour éviter de persister des traits invalides.
 */
export type ParseAIResponseResult =
  | { ok: true; traits: SpeciesVisualTraits }
  | { ok: false; reason: "json_parse" | "schema_mismatch"; detail: string };

export function parseSpeciesAIResponse(raw: string): ParseAIResponseResult {
  const clean = raw.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    return {
      ok: false,
      reason: "json_parse",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  const result = speciesVisualTraitsSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: "schema_mismatch",
      detail: result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, traits: result.data };
}

// ─── Fallback traits ─────────────────────────────────────────────────────

function buildFallbackTraits(speciesLabel: string): SpeciesVisualTraits {
  return {
    morphology: `Espèce ${speciesLabel} — traits à définir`,
    skinTexture: "peau non humaine distinctive",
    distinctiveMarkers: ["morphologie non humaine"],
    colorPalette: "tons naturels",
    heightProfile: "stature humanoïde",
    clothingStyle: "tenue adaptée à l'espèce",
    promptFragment: `${speciesLabel} creature, non-human features`,
  };
}

// ─── Résolveur principal ─────────────────────────────────────────────────

export type ResolveSpeciesResult = {
  traits: SpeciesVisualTraits;
  isNew: boolean;
  schemaVersion: number;
  promptHash: string | null;
  sourceModel: string;
};

export async function resolveSpeciesArchetype(
  prisma: PrismaClient,
  input: {
    projectId: string;
    speciesLabel: string;
    universe: string;
    tone: string;
    generateWithAI: (prompt: string) => Promise<string>;
    /** Identifiant du modèle utilisé par `generateWithAI`, pour audit. */
    sourceModel?: string;
    /** Si true, régénère même si un cache existe. */
    forceRegenerate?: boolean;
  },
): Promise<ResolveSpeciesResult> {
  const normalized = normalizeSpeciesLabel(input.speciesLabel);

  const prompt = `Tu es un expert en world-building manga.
Génère les traits visuels DE BASE d'une espèce : "${input.speciesLabel}"
dans un univers "${input.universe}" au ton "${input.tone}".

Ces traits sont PARTAGÉS par TOUS les membres de cette espèce.

Réponds UNIQUEMENT avec un objet JSON :
{
  "morphology": "description de la morphologie générale (1 phrase)",
  "skinTexture": "texture/matière de la peau ou de la surface du corps",
  "distinctiveMarkers": ["marqueur 1", "marqueur 2", "marqueur 3"],
  "colorPalette": "palette de couleurs dominantes",
  "heightProfile": "profil de taille et corpulence",
  "clothingStyle": "style vestimentaire typique de l'espèce",
  "promptFragment": "visual description for image generation prompt (EN, max 20 words)"
}`;

  const promptHash = computePromptHash(prompt);
  const sourceModel = input.sourceModel ?? "openai:unknown";

  const existing = await prisma.speciesArchetype.findUnique({
    where: { projectId_labelNormalized: { projectId: input.projectId, labelNormalized: normalized } },
  });

  // P1.2 — Cache-hit : on accepte la row si
  //   - même schemaVersion ;
  //   - même promptHash (ou hash manquant pour compat legacy) ;
  //   - baseVisualTraits encore conforme au schéma actuel ;
  //   - pas de forceRegenerate.
  if (existing && !input.forceRegenerate) {
    const cached = speciesVisualTraitsSchema.safeParse(existing.baseVisualTraits);
    const versionOk = (existing.schemaVersion ?? 1) === SPECIES_ARCHETYPE_SCHEMA_VERSION;
    const hashOk = !existing.promptHash || existing.promptHash === promptHash;
    if (cached.success && versionOk && hashOk) {
      return {
        traits: cached.data,
        isNew: false,
        schemaVersion: existing.schemaVersion ?? SPECIES_ARCHETYPE_SCHEMA_VERSION,
        promptHash: existing.promptHash ?? null,
        sourceModel: existing.sourceModel ?? "unknown",
      };
    }
    // Sinon : row obsolète — on régénère et on met à jour (voir upsert plus bas).
  }

  let traits: SpeciesVisualTraits;
  let effectiveSource: string;
  try {
    const raw = await input.generateWithAI(prompt);
    const parsed = parseSpeciesAIResponse(raw);
    if (!parsed.ok) {
      console.warn(
        `[species-resolver] AI response invalid (${parsed.reason}): ${parsed.detail}. Fallback pour "${input.speciesLabel}".`,
      );
      traits = buildFallbackTraits(input.speciesLabel);
      effectiveSource = `fallback:${parsed.reason}`;
    } else {
      traits = parsed.traits;
      effectiveSource = sourceModel;
    }
  } catch (e) {
    console.warn(
      `[species-resolver] AI call threw for "${input.speciesLabel}": ${e instanceof Error ? e.message : String(e)}. Fallback.`,
    );
    traits = buildFallbackTraits(input.speciesLabel);
    effectiveSource = "fallback:ai_error";
  }

  const payload = {
    projectId: input.projectId,
    label: input.speciesLabel,
    labelNormalized: normalized,
    baseVisualTraits: traits as unknown as object,
    promptFragment: traits.promptFragment,
    generatedByAI: !effectiveSource.startsWith("fallback:"),
    schemaVersion: SPECIES_ARCHETYPE_SCHEMA_VERSION,
    promptHash,
    sourceModel: effectiveSource,
  };

  // P1.1 (sprint 5) — Upsert transactionnel.
  // L'appel LLM (`input.generateWithAI`) a été effectué en dehors de la
  // transaction pour ne pas tenir un lock pendant un appel réseau long. La
  // transaction porte donc uniquement sur la vérification finale (au cas où
  // une autre requête concurrente a réécrit la row entre notre `findUnique`
  // initial et maintenant) et l'upsert.
  //
  // La contrainte @@unique([projectId, labelNormalized]) garantit l'idempotence
  // et empêche toute écriture dupliquée. Si deux requêtes concurrentes
  // aboutissent ici avec la même clé, la seconde fait un update idempotent.
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.speciesArchetype.findUnique({
      where: { projectId_labelNormalized: { projectId: input.projectId, labelNormalized: normalized } },
      select: { id: true, schemaVersion: true, promptHash: true },
    });
    // Si une autre requête a déjà mis à jour la row avec la même version ET le
    // même promptHash, on n'a rien à faire (idempotence).
    if (
      fresh
      && (fresh.schemaVersion ?? 1) === SPECIES_ARCHETYPE_SCHEMA_VERSION
      && fresh.promptHash === promptHash
      && !input.forceRegenerate
    ) {
      return;
    }
    await tx.speciesArchetype.upsert({
      where: { projectId_labelNormalized: { projectId: input.projectId, labelNormalized: normalized } },
      update: payload,
      create: payload,
    });
  });

  return {
    traits,
    isNew: !existing,
    schemaVersion: SPECIES_ARCHETYPE_SCHEMA_VERSION,
    promptHash,
    sourceModel: effectiveSource,
  };
}

export function buildSpeciesMemberPromptFragment(
  speciesTraits: SpeciesVisualTraits,
  individualVariation?: string,
): string {
  const base = speciesTraits.promptFragment;
  const markers = speciesTraits.distinctiveMarkers.slice(0, 2).join(", ");
  const individual = individualVariation ? `, ${individualVariation}` : "";
  return `${base}, ${markers}${individual}`;
}
