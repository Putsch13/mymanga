import { describe, expect, it } from "vitest";
import { toComposeVisualWorldKnownLocation } from "./visual-world-composer";

describe("toComposeVisualWorldKnownLocation", () => {
  it("fusionne briefs comme avant", () => {
    const out = toComposeVisualWorldKnownLocation({
      id: "a",
      name: "Dojo",
      description: "court",
      visualBrief: "tatamis",
      establishedVisualBrief: "version validée",
    });
    expect(out.description).toBe("version validée");
  });

  it("ajoute type, metadata et compte visualRefs dans la description", () => {
    const out = toComposeVisualWorldKnownLocation({
      id: "b",
      name: "Port",
      description: "Quai nord",
      type: "dock",
      metadata: { era: "futur", zone: "frigorifique" },
      visualRefs: [{ url: "x" }, { url: "y" }],
    });
    expect(out.description).toContain("Quai nord");
    expect(out.description).toContain("type=dock");
    expect(out.description).toMatch(/visualRefs:2/);
    expect(out.description).toContain("era");
  });

  it("sans texte de base, ne garde que les hints entre crochets", () => {
    const out = toComposeVisualWorldKnownLocation({
      id: "c",
      name: "Zone X",
      type: "ruines",
    });
    expect(out.description).toBe("[type=ruines]");
  });
});
