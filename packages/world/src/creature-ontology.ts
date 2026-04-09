import type { OntologyEntry, ProceduralEntity, SceneBlueprintInput } from "./types";
import { createSeededRng } from "./seeded-rng";

export const CREATURE_ONTOLOGY: OntologyEntry[] = [
  {
    id: "creature-imaginary-confidant",
    label: "créature confidente imaginaire",
    kind: "creature",
    tags: ["imaginaire", "confident", "stress", "dream"],
    universes: ["fantasy", "romance", "shojo"],
    tones: ["soft", "mélancolique", "emotion"],
    styles: ["manga", "premium", "delicate"],
    factions: [],
    weathers: [],
    worldStates: [],
    visualCues: ["forme rassurante", "grands yeux attentifs", "texture onirique"],
    interactionHooks: ["écoute une confession", "pose une question miroir", "guide vers une décision"],
    environmentSignals: [],
    rarity: 2,
  },
  {
    id: "creature-lab-aberration",
    label: "aberration de laboratoire",
    kind: "creature",
    tags: ["lab", "threat", "science", "mutation"],
    universes: ["horreur", "sci-fi", "post-apocalyptique"],
    tones: ["horror", "dark", "oppressant"],
    styles: ["manga", "premium", "sharp"],
    factions: [],
    weathers: [],
    worldStates: [],
    visualCues: ["membres asymétriques", "peau translucide", "silhouette brisée"],
    interactionHooks: ["bloque une sortie", "réagit à la lumière", "laisse des traces organiques"],
    environmentSignals: [],
    rarity: 1,
  },
  {
    id: "creature-arena-beast",
    label: "bête d’arène",
    kind: "creature",
    tags: ["arena", "action", "beast", "crowd"],
    universes: ["fantasy", "shōnen", "mecha"],
    tones: ["epic", "tendu"],
    styles: ["manga", "premium", "dynamic"],
    factions: [],
    weathers: [],
    worldStates: [],
    visualCues: ["cornes marquées", "musculature lisible", "armure partielle"],
    interactionHooks: ["force un repositionnement", "charge frontalement", "met la foule en délire"],
    environmentSignals: [],
    rarity: 2,
  },
  {
    id: "creature-neon-familiar",
    label: "familier néon",
    kind: "creature",
    tags: ["city", "cyberpunk", "neon", "pet"],
    universes: ["cyberpunk", "sci-fi"],
    tones: ["cool", "tendu"],
    styles: ["manga", "stylized", "premium"],
    factions: [],
    weathers: [],
    worldStates: [],
    visualCues: ["contours luminescents", "pattes fines", "queue holographique"],
    interactionHooks: ["mène vers un raccourci", "surgit dans le champ", "observe silencieusement"],
    environmentSignals: [],
    rarity: 3,
  },
  {
    id: "creature-sand-memory-whale",
    label: "baleine-mémoire des sables",
    kind: "creature",
    tags: ["desert", "memory", "colossal", "fantasy"],
    universes: ["fantasy", "post-apocalyptique", "seinen"],
    tones: ["mélancolique", "epic", "revelation"],
    styles: ["manga", "premium", "stylized"],
    factions: [],
    weathers: ["dust", "wind"],
    worldStates: [],
    visualCues: ["corps couvert de runes", "nage dans les dunes", "œil ancien"],
    interactionHooks: ["réveille un souvenir enfoui", "déforme l’horizon", "impose le silence"],
    environmentSignals: ["sillage sableux", "vibrations du sol"],
    rarity: 4,
  },
  {
    id: "creature-glass-moth-swarm",
    label: "essaim de papillons de verre",
    kind: "creature",
    tags: ["swarm", "glass", "romance", "mystic"],
    universes: ["fantasy", "shojo", "romance"],
    tones: ["soft", "emotion", "revelation"],
    styles: ["manga", "delicate", "premium"],
    factions: [],
    weathers: ["clear", "mist"],
    worldStates: [],
    visualCues: ["ailes translucides", "reflets pastel", "traînées lumineuses"],
    interactionHooks: ["encadre une confession", "réagit à l’émotion", "transforme l’air autour des héros"],
    environmentSignals: ["éclats fins", "poussière lumineuse"],
    rarity: 3,
  },
  {
    id: "creature-sewer-crawler",
    label: "rampant des égouts",
    kind: "creature",
    tags: ["sewer", "urban", "horror", "threat"],
    universes: ["cyberpunk", "horreur", "seinen"],
    tones: ["dark", "horror", "tendu"],
    styles: ["manga", "premium", "sharp"],
    factions: [],
    weathers: [],
    worldStates: [],
    visualCues: ["dos segmenté", "mâchoire humide", "membres repliés"],
    interactionHooks: ["surgit d’une grille", "coupe une retraite", "oblige à grimper"],
    environmentSignals: ["eau sale remuée", "cliquetis dans l’ombre"],
    rarity: 2,
  },
  {
    id: "creature-rooftop-kite-spirit",
    label: "esprit-cerf-volant du toit",
    kind: "creature",
    tags: ["school", "rooftop", "spirit", "wind"],
    universes: ["shojo", "fantasy", "slice_of_life"],
    tones: ["soft", "warm", "emotion"],
    styles: ["manga", "delicate", "premium"],
    factions: [],
    weathers: ["wind", "clear"],
    worldStates: [],
    visualCues: ["corps de tissu vivant", "queue aérienne", "mouvement léger"],
    interactionHooks: ["répond au doute du héros", "oriente le regard vers le ciel", "symbolise le lâcher-prise"],
    environmentSignals: ["courants d’air visibles", "ombre mouvante sur le béton"],
    rarity: 4,
  },
  {
    id: "creature-mecha-core-wisp",
    label: "lueur de noyau mécanique",
    kind: "creature",
    tags: ["mecha", "energy", "pit", "core"],
    universes: ["mecha", "sci-fi", "shōnen"],
    tones: ["epic", "tendu", "dramatic"],
    styles: ["manga", "dynamic", "premium"],
    factions: [],
    weathers: [],
    worldStates: [],
    visualCues: ["cœur lumineux fragmenté", "traînées électriques", "forme quasi abstraite"],
    interactionHooks: ["réactive une machine", "répond au pilote choisi", "transforme la tension en spectacle"],
    environmentSignals: ["étincelles orbitales", "résonance métallique"],
    rarity: 3,
  },
];

function scoreCreature(entry: OntologyEntry, input: SceneBlueprintInput) {
  const text = `${input.narrative.sceneSummary} ${input.narrative.panelIntent}`.toLowerCase();
  let score = 0;
  if (entry.universes.some((u) => input.style.universe.toLowerCase().includes(u.toLowerCase()))) score += 4;
  if (entry.tones.some((t) => input.style.tone.toLowerCase().includes(t.toLowerCase()))) score += 2;
  if (entry.tags.some((t) => text.includes(t.toLowerCase()) || input.scene.location.toLowerCase().includes(t.toLowerCase()))) score += 3;
  if (input.controls.visualExoticism >= 60) score += 2;
  return score;
}

export function generateCreatureSelection(input: SceneBlueprintInput, seed: number): ProceduralEntity[] {
  const rng = createSeededRng(seed);
  const ranked = [...CREATURE_ONTOLOGY]
    .map((entry) => ({ entry, score: scoreCreature(entry, input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const desired = input.controls.visualExoticism >= 70 ? 2 : input.cast.creatureNames.length > 0 ? 1 : 0;
  return desired === 0
    ? []
    : rng.pickMany(ranked.slice(0, Math.min(ranked.length, desired + 1)), desired).map(({ entry }) => ({
        id: `${entry.id}-${seed}`,
        label: entry.label,
        kind: "creature",
        visualCues: entry.visualCues,
        interactionHooks: entry.interactionHooks,
        sourceOntologyId: entry.id,
      }));
}
