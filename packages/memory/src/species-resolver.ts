import type { PrismaClient } from "@manga-ai-studio/db";

function normalizeSpeciesLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

export type SpeciesVisualTraits = {
  morphology: string;
  skinTexture: string;
  distinctiveMarkers: string[];
  colorPalette: string;
  heightProfile: string;
  clothingStyle: string;
  promptFragment: string;
};

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

export async function resolveSpeciesArchetype(
  prisma: PrismaClient,
  input: {
    projectId: string;
    speciesLabel: string;
    universe: string;
    tone: string;
    generateWithAI: (prompt: string) => Promise<string>;
  },
): Promise<{ traits: SpeciesVisualTraits; isNew: boolean }> {
  const normalized = normalizeSpeciesLabel(input.speciesLabel);

  const existing = await (prisma as any).speciesArchetype.findUnique({
    where: { projectId_labelNormalized: { projectId: input.projectId, labelNormalized: normalized } },
  });

  if (existing) {
    return {
      traits: existing.baseVisualTraits as SpeciesVisualTraits,
      isNew: false,
    };
  }

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

  let traits: SpeciesVisualTraits;
  try {
    const raw = await input.generateWithAI(prompt);
    const clean = raw.replace(/```json|```/g, "").trim();
    traits = JSON.parse(clean) as SpeciesVisualTraits;
  } catch {
    traits = {
      morphology: `Espèce ${input.speciesLabel} — traits à définir`,
      skinTexture: "peau non humaine distinctive",
      distinctiveMarkers: ["morphologie non humaine"],
      colorPalette: "tons naturels",
      heightProfile: "stature humanoïde",
      clothingStyle: "tenue adaptée à l'espèce",
      promptFragment: `${input.speciesLabel} creature, non-human features`,
    };
  }

  await (prisma as any).speciesArchetype.create({
    data: {
      projectId: input.projectId,
      label: input.speciesLabel,
      labelNormalized: normalized,
      baseVisualTraits: traits as object,
      promptFragment: traits.promptFragment,
      generatedByAI: true,
    },
  });

  return { traits, isNew: true };
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
