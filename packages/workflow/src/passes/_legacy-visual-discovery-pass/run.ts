import {
  createDiscoveredEntity,
  detectEntitiesFromText,
  extractTextFromBeats,
} from "./detection";
import {
  CREATURE_PATTERNS,
  DEFAULT_FORBIDDEN_VISUAL_PROPS,
  DEFAULT_SUSPICIOUS_VISUAL_PROPS,
  FACTION_PATTERNS,
  HYBRID_PATTERNS,
  LOCATION_PATTERNS,
  NPC_GROUP_PATTERNS,
  ROBOT_PATTERNS,
  SUBLOCATION_PATTERNS,
  VEHICLE_OR_LARGE_PROP_PATTERNS,
} from "./patterns";
import type {
  BeatVisualBinding,
  ChapterVisualDiscoveryContract,
  DiscoveredVisualEntity,
  VisualDiscoveryPassInput,
  VisualDiscoveryPassResult,
} from "./types";

/**
 * Exécute le VisualDiscoveryPass.
 */
export function runVisualDiscoveryPass(
  input: VisualDiscoveryPassInput,
): VisualDiscoveryPassResult {
  const warnings: string[] = [];

  const characters: DiscoveredVisualEntity[] = [];
  const npcGroups: DiscoveredVisualEntity[] = [];
  const locations: DiscoveredVisualEntity[] = [];
  const sublocations: DiscoveredVisualEntity[] = [];
  const vehiclesOrLargeProps: DiscoveredVisualEntity[] = [];
  const robots: DiscoveredVisualEntity[] = [];
  const hybrids: DiscoveredVisualEntity[] = [];
  const creatures: DiscoveredVisualEntity[] = [];
  const factions: DiscoveredVisualEntity[] = [];
  const props: DiscoveredVisualEntity[] = [];
  const species: DiscoveredVisualEntity[] = [];
  const beatBindings: BeatVisualBinding[] = [];
  const rejectedEntities: Array<{ label: string; reason: string }> = [];

  // 1. Personnages connus
  for (const c of input.knownCharacters ?? []) {
    characters.push({
      id: c.id,
      label: c.name,
      kind: "character",
      source: "existing_user_entity",
      confidence: 1.0,
      requiredBeats: [],
      optionalBeats: [],
      visualDescription: c.description ?? c.name,
      canonLevel: "user_canon",
      detectedIn: [],
      required: true,
    });
  }

  // 2. Lieux connus
  for (const loc of input.knownLocations ?? []) {
    locations.push({
      id: loc.id,
      label: loc.name,
      kind: "location",
      source: "existing_user_entity",
      confidence: 1.0,
      requiredBeats: [],
      optionalBeats: [],
      visualDescription: loc.description ?? loc.name,
      canonLevel: "user_canon",
      detectedIn: [],
      required: true,
    });
  }

  // 3. Texte agrégé pour détection globale
  const beatTexts = extractTextFromBeats(input.beats);
  const allText =
    beatTexts.map((b) => b.text).join(" ") +
    " " +
    (input.chapterSummary ?? "") +
    " " +
    (input.userIntent ?? "");

  const detectedNpcGroups = detectEntitiesFromText(allText, NPC_GROUP_PATTERNS);
  const detectedLocations = detectEntitiesFromText(allText, LOCATION_PATTERNS);
  const detectedVehicles = detectEntitiesFromText(allText, VEHICLE_OR_LARGE_PROP_PATTERNS);
  const detectedSublocations = detectEntitiesFromText(allText, SUBLOCATION_PATTERNS);
  const detectedRobots = detectEntitiesFromText(allText, ROBOT_PATTERNS);
  const detectedHybrids = detectEntitiesFromText(allText, HYBRID_PATTERNS);
  const detectedCreatures = detectEntitiesFromText(allText, CREATURE_PATTERNS);
  const detectedFactions = detectEntitiesFromText(allText, FACTION_PATTERNS);

  // PNJ groups
  for (const [label] of detectedNpcGroups) {
    const beatsWithEntity = beatTexts
      .filter((bt) => NPC_GROUP_PATTERNS.some((p) => p.label === label && p.pattern.test(bt.text)))
      .map((bt) => bt.beatId);
    npcGroups.push(
      createDiscoveredEntity(
        label,
        "npc_group",
        "story_text",
        beatsWithEntity,
        0.8,
        `Groupe de ${label}`,
      ),
    );
  }

  // Lieux détectés (seulement si pas déjà connus)
  const knownLocationLabels = new Set(
    (input.knownLocations ?? []).map((l) => l.name.toLowerCase()),
  );
  for (const [label] of detectedLocations) {
    if (knownLocationLabels.has(label.toLowerCase())) continue;
    const beatsWithEntity = beatTexts
      .filter((bt) => LOCATION_PATTERNS.some((p) => p.label === label && p.pattern.test(bt.text)))
      .map((bt) => bt.beatId);
    locations.push(
      createDiscoveredEntity(label, "location", "story_text", beatsWithEntity, 0.7),
    );
  }

  for (const [label] of detectedRobots) {
    robots.push(createDiscoveredEntity(label, "robot", "story_text", [], 0.75));
  }
  for (const [label] of detectedHybrids) {
    hybrids.push(createDiscoveredEntity(label, "hybrid", "story_text", [], 0.75));
  }
  for (const [label] of detectedCreatures) {
    creatures.push(createDiscoveredEntity(label, "creature", "story_text", [], 0.75));
  }
  for (const [label] of detectedFactions) {
    factions.push(createDiscoveredEntity(label, "faction", "story_text", [], 0.7));
  }

  // P1.10 — Véhicules et grands props
  for (const [label] of detectedVehicles) {
    const beatsWithEntity = beatTexts
      .filter((bt) =>
        VEHICLE_OR_LARGE_PROP_PATTERNS.some((p) => p.label === label && p.pattern.test(bt.text)),
      )
      .map((bt) => bt.beatId);
    const evidenceText = beatTexts.find((bt) =>
      VEHICLE_OR_LARGE_PROP_PATTERNS.some((p) => p.label === label && p.pattern.test(bt.text)),
    )?.text.slice(0, 100);
    vehiclesOrLargeProps.push(
      createDiscoveredEntity(
        label,
        "vehicle_or_large_prop",
        "story_text",
        beatsWithEntity,
        0.8,
        `Véhicule: ${label}`,
        "chapter_temporary",
        evidenceText,
      ),
    );
  }

  // P1.10 — Sous-contextes
  for (const [label] of detectedSublocations) {
    const beatsWithEntity = beatTexts
      .filter((bt) =>
        SUBLOCATION_PATTERNS.some((p) => p.label === label && p.pattern.test(bt.text)),
      )
      .map((bt) => bt.beatId);
    sublocations.push(
      createDiscoveredEntity(
        label,
        "sublocation",
        "story_text",
        beatsWithEntity,
        0.75,
        `Sous-contexte: ${label}`,
      ),
    );
  }

  // 4. Bindings beat → entités
  for (const bt of beatTexts) {
    const beatChars = characters
      .filter((c) => bt.text.toLowerCase().includes(c.label.toLowerCase()))
      .map((c) => c.label);
    const beatLocs = locations
      .filter((l) => bt.text.toLowerCase().includes(l.label.toLowerCase()))
      .map((l) => l.label);
    const beatNpcs = npcGroups
      .filter((n) => n.detectedIn.includes(bt.beatId))
      .map((n) => n.label);

    beatBindings.push({
      beatId: bt.beatId,
      characters: beatChars,
      locations: beatLocs,
      npcGroups: beatNpcs,
      props: [],
    });
  }

  // 5. Vérifications et warnings
  if (locations.length === 0) {
    warnings.push("no_location_detected — le texte ne mentionne aucun lieu clair");
  }
  if (npcGroups.length === 0 && allText.length > 200) {
    if (/groupe|gens|personnes|foule/i.test(allText)) {
      warnings.push("potential_npc_group_missed — le texte mentionne des groupes mais aucun PNJ détecté");
    }
  }

  // 6. Props interdits
  let forbiddenPropsStripped = 0;
  for (const fp of DEFAULT_FORBIDDEN_VISUAL_PROPS) {
    if (allText.toLowerCase().includes(fp.toLowerCase())) {
      forbiddenPropsStripped++;
    }
  }

  const contract: ChapterVisualDiscoveryContract = {
    chapterId: input.chapterId,
    characters,
    npcGroups,
    locations,
    sublocations,
    vehiclesOrLargeProps,
    species,
    robots,
    hybrids,
    creatures,
    factions,
    props,
    forbiddenProps: [...DEFAULT_FORBIDDEN_VISUAL_PROPS, ...DEFAULT_SUSPICIOUS_VISUAL_PROPS],
    rejectedEntities,
    beatBindings,
  };

  const stats = {
    charactersFound: characters.length,
    locationsFound: locations.length,
    sublocationsFound: sublocations.length,
    vehiclesFound: vehiclesOrLargeProps.length,
    npcGroupsFound: npcGroups.length,
    robotsFound: robots.length,
    hybridsFound: hybrids.length,
    creaturesFound: creatures.length,
    factionsFound: factions.length,
    propsFound: props.length,
    forbiddenPropsStripped,
    rejectedCount: rejectedEntities.length,
  };

  console.info(
    `[visual-discovery] characters=${stats.charactersFound} locations=${stats.locationsFound} ` +
      `sublocations=${stats.sublocationsFound} vehicles=${stats.vehiclesFound} ` +
      `npcGroups=${stats.npcGroupsFound} robots=${stats.robotsFound} hybrids=${stats.hybridsFound} ` +
      `creatures=${stats.creaturesFound} props=${stats.propsFound} rejected=${stats.rejectedCount}`,
  );

  return { contract, warnings, stats };
}

/**
 * Formate le log du VisualDiscoveryPass.
 */
export function formatVisualDiscoveryLog(result: VisualDiscoveryPassResult): string {
  const s = result.stats;
  return (
    `[visual-discovery] characters=${s.charactersFound} locations=${s.locationsFound} ` +
    `npcGroups=${s.npcGroupsFound} robots=${s.robotsFound} hybrids=${s.hybridsFound} ` +
    `creatures=${s.creaturesFound}` +
    (result.warnings.length > 0 ? ` warnings=${result.warnings.join(",")}` : "")
  );
}
