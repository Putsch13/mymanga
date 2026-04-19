/**
 * P1.4 (sprint 3) — Tests du helper de marqueurs décor utilisé par les
 * retries "environment" / "composition".
 *
 * Objectif : prouver que les décors canoniques survivent à un retry, c.-à-d.
 * que `buildLocationMarkersLine` retourne une chaîne contenant :
 *   - permanentArchitecture
 *   - canonicalProps
 *   - palette
 *   - canonicalLighting
 *   - referenceAssets (canon-refs=N)
 *   - requires_visual_continuity quand la location est canon.
 */

import { describe, it, expect } from "vitest";
import {
  buildLocationMarkersLine,
  formatLocationCanonMarkersLine,
} from "@/lib/retry/build-location-markers";
import { resolveLocationVisualCanon } from "@/lib/canon/resolve-location-visual-canon";

describe("formatLocationCanonMarkersLine (P1.4)", () => {
  it("inclut nom, type, brief, architecture, props, palette, lighting, views", () => {
    const canon = resolveLocationVisualCanon({
      id: "loc-1",
      name: "Academy of Tōkai",
      type: "school",
      establishedVisualBrief:
        "Japanese modernist academy with a cherry blossom courtyard",
      canonImageUrl: null,
      visualRefs: [],
      canonLocked: true,
      metadata: {
        permanentArchitecture: [
          "red torii gate at entry",
          "clocktower with brass bell",
          "glass atrium roof",
        ],
        canonicalProps: ["wooden shoe lockers", "rooftop water tank"],
        palette: ["navy", "beige", "ochre"],
        canonicalLighting: ["overcast afternoon"],
        canonicalViews: ["establishing courtyard wide", "rooftop low angle"],
      },
    });

    const line = formatLocationCanonMarkersLine(canon);

    expect(line).toContain("location: Academy of Tōkai");
    expect(line).toContain("type: school");
    expect(line).toContain("Japanese modernist academy");
    expect(line).toContain("architectural markers (");
    expect(line).toContain("red torii gate at entry");
    expect(line).toContain("canonical props (");
    expect(line).toContain("wooden shoe lockers");
    expect(line).toContain("palette (");
    expect(line).toContain("navy, beige, ochre");
    expect(line).toContain("lighting (");
    expect(line).toContain("views (");
    expect(line).toContain("requires_visual_continuity");
  });

  it("marque canon-refs=N quand un canonImageUrl stable existe", () => {
    const canon = resolveLocationVisualCanon({
      id: "loc-2",
      name: "Neo-Tokyo Plaza",
      type: "city",
      canonImageUrl: "https://cdn.myapp.com/locations/neo-tokyo.webp",
      visualRefs: [],
      metadata: {
        permanentArchitecture: ["mega-neon billboard", "suspended monorail"],
      },
    });

    const line = formatLocationCanonMarkersLine(canon);
    expect(line).toContain("canon-refs=1");
  });

  it("retourne une chaîne vide uniquement si aucune info exploitable", () => {
    const canon = resolveLocationVisualCanon({
      id: "loc-empty",
      name: "Nowhere",
    });
    const line = formatLocationCanonMarkersLine(canon);
    expect(line).toContain("location: Nowhere");
    expect(line).not.toContain("canon-refs=");
    expect(line).not.toContain("architectural markers");
  });
});

describe("buildLocationMarkersLine (P1.4)", () => {
  function makePrisma(locationRow: Record<string, unknown> | null): {
    location: { findUnique: (args: unknown) => Promise<Record<string, unknown> | null> };
  } {
    return {
      location: {
        findUnique: async () => locationRow,
      },
    };
  }

  it("retourne une ligne vide si locationId est null", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = makePrisma(null) as any;
    const out = await buildLocationMarkersLine({ prisma, locationId: null });
    expect(out).toBe("");
  });

  it("retourne une ligne vide si la location n'existe pas", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = makePrisma(null) as any;
    const out = await buildLocationMarkersLine({ prisma, locationId: "loc-x" });
    expect(out).toBe("");
  });

  it("utilise le canon unifié (permanentArchitecture + canonicalProps + palette) quand disponible", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma = makePrisma({
      id: "loc-s",
      name: "Sanctuaire Inari",
      type: "shrine",
      description: null,
      visualBrief: null,
      establishedVisualBrief: "Ancient wooden shrine on a mossy cliff",
      canonImageUrl: null,
      visualRefs: [],
      canonLocked: true,
      metadata: {
        permanentArchitecture: ["vermillion torii path", "stone fox statues"],
        canonicalProps: ["stone wash basin", "paper ema charms"],
        palette: ["vermillion", "slate", "moss"],
      },
    }) as any;
    const out = await buildLocationMarkersLine({ prisma, locationId: "loc-s" });
    expect(out).toContain("location: Sanctuaire Inari");
    expect(out).toContain("vermillion torii path");
    expect(out).toContain("stone wash basin");
    expect(out).toContain("vermillion, slate, moss");
    expect(out).toContain("requires_visual_continuity");
  });

  it("capture les erreurs Prisma et retourne \"\" sans throw", async () => {
    const prisma = {
      location: {
        findUnique: async () => {
          throw new Error("db_down");
        },
      },
    } as unknown as Parameters<typeof buildLocationMarkersLine>[0]["prisma"];
    const out = await buildLocationMarkersLine({ prisma, locationId: "loc-e" });
    expect(out).toBe("");
  });
});
