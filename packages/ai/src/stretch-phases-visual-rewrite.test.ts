import { describe, it, expect } from "vitest";

const ABSTRACT_KEYWORDS = [
  "la situation évolue",
  "les enjeux montent",
  "la tension monte",
  "un nouvel élément complique",
  "ce qui semblait fixe devient instable",
  "la pression s'intensifie",
];

describe("STRETCH_PHASES visual rewrite", () => {
  // STRETCH_PHASES vit désormais dans chapter/bundle-beats.ts (audit-v9 split).
  const stretchSourceUrl = new URL("./chapter/bundle-beats.ts", import.meta.url);

  it("STRETCH_PHASES source does not contain abstract-only phrases", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(stretchSourceUrl.pathname, "utf-8");
    const match = source.match(/const STRETCH_PHASES[\s\S]*?\];/);
    expect(match).toBeTruthy();
    const block = match![0];

    for (const keyword of ABSTRACT_KEYWORDS) {
      expect(block).not.toContain(keyword);
    }
  });

  it("each STRETCH_PHASE contains a concrete visual element", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(stretchSourceUrl.pathname, "utf-8");
    const match = source.match(/const STRETCH_PHASES[\s\S]*?\];/);
    expect(match).toBeTruthy();
    const block = match![0];

    const concreteSignals = /obstacle|intervient|décision|environnement|confrontation|conséquence|face à|physique|visible|bloque|transforme/i;
    expect(block).toMatch(concreteSignals);
  });
});
