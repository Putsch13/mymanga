/**
 * Sprint 2 — Composition des panels
 *
 * Tests du compositeur de bulles. Invariants :
 *   - toutes les bulles restent dans [0..100]
 *   - reservedZones évitées si alternative disponible
 *   - overrides persistés respectés
 *   - ordre des bulles = ordre des dialogues
 *   - caption et SFX émis indépendamment
 */

import { describe, expect, it } from "vitest";
import {
  composePanelTextLayer,
  mergeBubbleOverride,
  reservedZonesToForbiddenZones,
} from "../components/manga/panel/bubble-compositor";
import { isInsidePanel, type BubbleLayout } from "../components/manga/panel/bubble-layout-model";

describe("bubble-compositor — composePanelTextLayer", () => {
  it("panel sans dialogue/narration/sfx → layer vide", () => {
    const layer = composePanelTextLayer({ panelId: "p1", dialogues: [] });
    expect(layer.bubbles).toHaveLength(0);
    expect(layer.captions).toHaveLength(0);
    expect(layer.sfx).toHaveLength(0);
  });

  it("place une bulle par dialogue, dans l'ordre fourni", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: [
        { speaker: "Héros", text: "Salut." },
        { speaker: "Alliée", text: "Ça va ?" },
        { speaker: "Villain", text: "Trop tard." },
      ],
    });
    expect(layer.bubbles).toHaveLength(3);
    expect(layer.bubbles[0]!.text).toBe("Salut.");
    expect(layer.bubbles[1]!.text).toBe("Ça va ?");
    expect(layer.bubbles[2]!.text).toBe("Trop tard.");
  });

  it("invariant : toutes les bulles restent dans [0..100]", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: Array.from({ length: 6 }, (_, i) => ({ speaker: `H${i}`, text: `T${i}` })),
    });
    for (const b of layer.bubbles) {
      expect(isInsidePanel(b.bounds)).toBe(true);
    }
  });

  it("maxBubbles reader = 6 par défaut", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: Array.from({ length: 10 }, (_, i) => ({ speaker: `H${i}`, text: `T${i}` })),
    });
    expect(layer.bubbles).toHaveLength(6);
  });

  it("maxBubbles webtoon = 8 par défaut", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      isWebtoon: true,
      dialogues: Array.from({ length: 10 }, (_, i) => ({ speaker: `H${i}`, text: `T${i}` })),
    });
    expect(layer.bubbles).toHaveLength(8);
  });

  it("évite les reservedTextZones si possible", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: [{ speaker: "H", text: "A" }],
      reservedTextZones: ["top-left"],
    });
    const b = layer.bubbles[0]!;
    // Le best slot choisi ne doit pas matcher top-left (x=4, y=4).
    expect(b.bounds.x > 40 || b.bounds.y > 20).toBe(true);
  });

  it("overrides persistés : respecte bounds et text", () => {
    const overrides = new Map<string, Partial<BubbleLayout>>();
    overrides.set("p1:speech:0", {
      bounds: { x: 10, y: 10, width: 30, height: 15 },
      text: "Texte édité",
      priority: 99,
    });
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: [{ speaker: "H", text: "Original" }],
      overrides,
    });
    expect(layer.bubbles[0]!.text).toBe("Texte édité");
    expect(layer.bubbles[0]!.bounds.x).toBe(10);
    expect(layer.bubbles[0]!.bounds.y).toBe(10);
    expect(layer.bubbles[0]!.priority).toBe(99);
  });

  it("narration → caption séparée, isEditable par défaut true", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: [],
      narration: "Il faisait nuit.",
    });
    expect(layer.captions).toHaveLength(1);
    expect(layer.captions[0]!.text).toBe("Il faisait nuit.");
    expect(layer.captions[0]!.kind).toBe("caption");
    expect(layer.captions[0]!.isEditable).toBe(true);
  });

  it("sfx → layer dédié, style subtle si dialogue présent", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: [{ speaker: "H", text: "A" }],
      sfx: "BOUM",
    });
    expect(layer.sfx).toHaveLength(1);
    expect(layer.sfx[0]!.styleVariant).toBe("sfx_subtle");
  });

  it("sfx → style bold si pas de dialogue", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: [],
      sfx: "BOUM",
    });
    expect(layer.sfx[0]!.styleVariant).toBe("sfx_bold");
  });

  it("bulle 'thought' utilise style soft", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: [{ speaker: "H", text: "Hmm", kind: "thought" }],
    });
    expect(layer.bubbles[0]!.kind).toBe("thought");
    expect(layer.bubbles[0]!.styleVariant).toBe("soft");
  });

  it("bubbleId stable : panelId + kind + index", () => {
    const layer = composePanelTextLayer({
      panelId: "panel-42",
      dialogues: [
        { speaker: "A", text: "1" },
        { speaker: "B", text: "2" },
      ],
    });
    expect(layer.bubbles[0]!.bubbleId).toBe("panel-42:speech:0");
    expect(layer.bubbles[1]!.bubbleId).toBe("panel-42:speech:1");
  });
});

describe("bubble-compositor — forbiddenZones", () => {
  it("évite les forbiddenZones (visage héros)", () => {
    const layer = composePanelTextLayer({
      panelId: "p1",
      dialogues: [{ speaker: "H", text: "A" }],
      forbiddenZones: [
        { id: "face", label: "visage", bounds: { x: 0, y: 0, width: 50, height: 50 }, weight: 100 },
      ],
    });
    const b = layer.bubbles[0]!;
    // Le placeur a choisi le slot le moins coûteux — pas nécessairement 100% hors
    // zone, mais le cost doit privilégier les slots bas/droite.
    expect(b.bounds.y > 20 || b.bounds.x > 40).toBe(true);
  });

  it("reservedZonesToForbiddenZones : convertit chaque zone", () => {
    const zones = reservedZonesToForbiddenZones(["top-left", "bottom-right"]);
    expect(zones).toHaveLength(2);
    expect(zones[0]!.weight).toBe(40);
    expect(zones[0]!.bounds.x).toBe(2);
  });
});

describe("bubble-compositor — mergeBubbleOverride", () => {
  it("patch sans previous → renvoie patch", () => {
    const merged = mergeBubbleOverride(null, { text: "hello" });
    expect(merged).toEqual({ text: "hello" });
  });

  it("patch avec previous → fusionne, clé null = clear", () => {
    const previous = { text: "old", priority: 10 };
    const merged = mergeBubbleOverride(previous, { text: "new", priority: null as unknown as undefined });
    expect(merged.text).toBe("new");
    expect(merged.priority).toBeUndefined();
  });

  it("patch avec undefined → conserve previous", () => {
    const merged = mergeBubbleOverride({ text: "old", priority: 10 }, { text: undefined });
    expect(merged.text).toBe("old");
  });
});
