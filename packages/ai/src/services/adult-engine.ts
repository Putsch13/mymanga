export type AdultEngine = "realistic" | "fantasy";

export function resolveAdultEngine(input: {
  primaryGenre?: string | null;
  subGenres?: string[] | null;
  visualStyle?: string | null;
  userIntent?: string | null;
}): AdultEngine {
  const text = [
    input.primaryGenre ?? "",
    ...(input.subGenres ?? []),
    input.visualStyle ?? "",
    input.userIntent ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const fantasySignals = [
    "hentai",
    "fantasy",
    "dark fantasy",
    "isekai",
    "démon",
    "demon",
    "monstre",
    "monster",
    "créature",
    "creature",
    "succube",
    "succubus",
    "tentacule",
    "tentacle",
    "elfe",
    "elf",
    "slime",
  ];

  const realisticSignals = [
    "réaliste",
    "realistic",
    "semi_realistic",
    "semi realistic",
    "réel",
    "real world",
    "contemporain",
    "modern",
    "photoreal",
  ];

  if (fantasySignals.some((signal) => text.includes(signal))) return "fantasy";
  if (realisticSignals.some((signal) => text.includes(signal))) return "realistic";
  return "fantasy";
}
