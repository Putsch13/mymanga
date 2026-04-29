import { describe, expect, it } from "vitest";
import { resolveCanonicalLocation } from "./resolve-canonical-location";

describe("resolveCanonicalLocation", () => {
  it("retourne nom — description quand alias matche", () => {
    expect(
      resolveCanonicalLocation(
        [{ name: "Café Zen", description: "Néons doux", aliases: ["zen"] }],
        "au zen",
      ),
    ).toBe("Café Zen — Néons doux");
  });

  it("retourne le brut si aucun match", () => {
    expect(resolveCanonicalLocation([{ name: "Rue A" }], "Rue B")).toBe("Rue B");
  });
});
