/**
 * Tests pour le VisualDiscoveryPass.
 */

import { describe, it, expect } from "vitest";
import { runVisualDiscoveryPass } from "./visual-discovery-pass";

describe("VisualDiscoveryPass", () => {
  it("détecte les lieux depuis le texte narratif", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [
        {
          beatId: "beat-1",
          summary: "Marius arrive au port et observe les bateaux.",
        },
        {
          beatId: "beat-2",
          summary: "Il marche dans les rues de la ville.",
        },
      ],
      knownCharacters: [],
      knownLocations: [],
    });

    expect(result.contract.locations.length).toBeGreaterThanOrEqual(1);
    expect(result.contract.locations.some((l) => l.label === "port")).toBe(true);
    expect(result.contract.locations.some((l) => l.label === "ville")).toBe(true);
  });

  it("détecte les groupes PNJ depuis le texte", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [
        {
          beatId: "beat-1",
          summary: "Marius observe les pêcheurs au travail sur le quai.",
        },
        {
          beatId: "beat-2",
          summary: "La foule se presse autour des marchands.",
        },
      ],
      knownCharacters: [],
      knownLocations: [],
    });

    expect(result.contract.npcGroups.length).toBeGreaterThanOrEqual(1);
    expect(result.contract.npcGroups.some((n) => n.label === "pêcheurs")).toBe(true);
  });

  it("inclut les personnages connus dans le contrat", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [{ beatId: "beat-1", summary: "Marius et Maya parlent." }],
      knownCharacters: [
        { id: "marius", name: "Marius", description: "Le héros" },
        { id: "maya", name: "Maya", description: "Son amie" },
      ],
      knownLocations: [],
    });

    expect(result.contract.characters.length).toBe(2);
    expect(result.contract.characters.some((c) => c.id === "marius")).toBe(true);
    expect(result.contract.characters.some((c) => c.id === "maya")).toBe(true);
    expect(result.contract.characters[0]!.canonLevel).toBe("user_canon");
  });

  it("détecte les robots et créatures", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [
        {
          beatId: "beat-1",
          summary: "Un robot géant attaque le village.",
        },
        {
          beatId: "beat-2",
          summary: "Le dragon apparaît dans le ciel.",
        },
      ],
      knownCharacters: [],
      knownLocations: [],
    });

    expect(result.contract.robots.length).toBeGreaterThanOrEqual(1);
    expect(result.contract.creatures.some((c) => c.label === "dragon")).toBe(true);
  });

  it("produit un warning si aucun lieu n'est détecté", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [{ beatId: "beat-1", summary: "Dialogue court." }],
      knownCharacters: [],
      knownLocations: [],
    });

    expect(result.warnings.some((w) => w.includes("no_location_detected"))).toBe(true);
  });

  it("n'ajoute pas les lieux déjà connus en double", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [{ beatId: "beat-1", summary: "Marius est au port." }],
      knownCharacters: [],
      knownLocations: [{ id: "loc-port", name: "port", description: "Le port principal" }],
    });

    const portLocations = result.contract.locations.filter(
      (l) => l.label.toLowerCase().includes("port"),
    );
    expect(portLocations.length).toBe(1);
    expect(portLocations[0]!.canonLevel).toBe("user_canon");
  });

  it("construit les bindings beat → entités", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [
        { beatId: "beat-1", summary: "Marius arrive au port." },
        { beatId: "beat-2", summary: "Maya rejoint Marius dans la forêt." },
      ],
      knownCharacters: [
        { id: "marius", name: "Marius" },
        { id: "maya", name: "Maya" },
      ],
      knownLocations: [],
    });

    expect(result.contract.beatBindings.length).toBe(2);
    const beat1 = result.contract.beatBindings.find((b) => b.beatId === "beat-1");
    expect(beat1?.characters).toContain("Marius");
    expect(beat1?.locations).toContain("port");
  });

  it("log les stats correctement", () => {
    const result = runVisualDiscoveryPass({
      chapterId: "ch-1",
      beats: [{ beatId: "beat-1", summary: "Marius au port avec les pêcheurs." }],
      knownCharacters: [{ id: "marius", name: "Marius" }],
      knownLocations: [],
    });

    expect(result.stats.charactersFound).toBe(1);
    expect(result.stats.locationsFound).toBeGreaterThanOrEqual(1);
    expect(result.stats.npcGroupsFound).toBeGreaterThanOrEqual(1);
  });
});
