import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("premium pipeline — pas de détection PNJ regex dans run-premium-v3-pipeline", () => {
  it("run-premium-v3-pipeline.ts ne contient plus les symboles regex NPC", () => {
    const file = fs.readFileSync(path.join(__dirname, "../run-premium-v3-pipeline.ts"), "utf8");
    expect(file).not.toContain("NPC_GROUP_DETECTION_PATTERNS");
    expect(file).not.toContain("detectNpcGroupsFromText");
    expect(file).not.toContain("npcGroupsFromText");
  });
});
