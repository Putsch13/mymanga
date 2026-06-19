/**
 * PR11 — Garde-fou : les sous-chemins `world/legacy/*` exposés dans `package.json#exports`
 * restent résolubles (aucune dépendance à la racine `@manga-ai-studio/world` dans ce fichier).
 */

import { describe, expect, it } from "vitest";
import { NPC_ONTOLOGY } from "@manga-ai-studio/world/legacy/npc-ontology";
import { LOCATION_ONTOLOGY } from "@manga-ai-studio/world/legacy/location-ontology";
import { CREATURE_ONTOLOGY } from "@manga-ai-studio/world/legacy/creature-ontology";

describe("world legacy exports (PR11)", () => {
  it("expose des ontologies avec ids uniques", () => {
    for (const list of [NPC_ONTOLOGY, LOCATION_ONTOLOGY, CREATURE_ONTOLOGY]) {
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      const ids = list.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
