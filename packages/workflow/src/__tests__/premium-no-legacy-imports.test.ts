import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("premium pipeline — frontières legacy", () => {
  it("run-premium-v3-pipeline.ts n’importe pas les ontologies / scene-blueprint world legacy", () => {
    const file = fs.readFileSync(path.join(__dirname, "../run-premium-v3-pipeline.ts"), "utf8");
    expect(file).not.toContain("@manga-ai-studio/world/legacy/location-ontology");
    expect(file).not.toContain("@manga-ai-studio/world/legacy/npc-ontology");
    expect(file).not.toContain("@manga-ai-studio/world/legacy/creature-ontology");
    expect(file).not.toContain("@manga-ai-studio/world/legacy/scene-blueprint");
  });

  it("run-premium-v3-pipeline.ts n’utilise pas la détection PNJ regex legacy", () => {
    const file = fs.readFileSync(path.join(__dirname, "../run-premium-v3-pipeline.ts"), "utf8");
    expect(file).not.toContain("NPC_GROUP_DETECTION_PATTERNS");
    expect(file).not.toContain("detectNpcGroupsFromText");
  });
});
