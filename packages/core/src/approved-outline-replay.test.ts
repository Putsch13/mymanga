import { describe, expect, it } from "vitest";
import { approvedOutlineSchema } from "./types/approved-outline";
import { buildApprovedChapterOutlineReplayFromOutlineBeats } from "./approved-outline-replay";

describe("buildApprovedChapterOutlineReplayFromOutlineBeats", () => {
  it("produit un schéma Zod valide", () => {
    const ao = buildApprovedChapterOutlineReplayFromOutlineBeats({
      summary: "Court",
      cliffhanger: "Fin",
      source: "estimate_preview",
      beats: [
        {
          id: "b1",
          summary: "Un beat",
          characters: ["Miro"],
          location: "cour",
          pageRole: "establishing",
          turn: "tension",
          emotionalDelta: 0,
          structuredBeat: null,
        },
      ],
    });
    const parsed = approvedOutlineSchema.safeParse(ao);
    expect(parsed.success).toBe(true);
  });
});
