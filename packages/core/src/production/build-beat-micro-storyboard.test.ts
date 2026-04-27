/**
 * build-beat-micro-storyboard.test.ts
 *
 * P1.18 — Tests pour le micro-storyboard par beat.
 */

import { describe, it, expect } from "vitest";
import {
  buildBeatMicroStoryboard,
  assertPanelSpecificity,
} from "./build-beat-micro-storyboard";

describe("buildBeatMicroStoryboard", () => {
  it("should generate micro-storyboard for a simple beat", () => {
    const result = buildBeatMicroStoryboard({
      beatId: "beat-1",
      beatText: "Marius regarde Maya avec inquiétude.",
      beatType: "dialogue",
      panelCount: 2,
      characters: [
        { id: "marius", name: "Marius" },
        { id: "maya", name: "Maya" },
      ],
      location: { id: "port", name: "Le port" },
    });

    expect(result.beatId).toBe("beat-1");
    expect(result.panels).toHaveLength(2);
    expect(result.panels[0].microAction).toBeTruthy();
    expect(result.panels[0].narrativeRole).toBeTruthy();
  });

  it("should distribute narrative roles across panels", () => {
    const result = buildBeatMicroStoryboard({
      beatId: "beat-2",
      beatText: "Une confrontation intense entre les deux personnages.",
      beatType: "action",
      panelCount: 4,
      characters: [
        { id: "hero", name: "Hero" },
        { id: "villain", name: "Villain" },
      ],
      location: { id: "arena", name: "Arena" },
    });

    const roles = result.panels.map((p) => p.narrativeRole);
    expect(roles).toContain("establishing");
  });

  it("should not produce generic actions", () => {
    const result = buildBeatMicroStoryboard({
      beatId: "beat-3",
      beatText: "Le héros court à travers la forêt.",
      beatType: "action",
      panelCount: 3,
      characters: [{ id: "hero", name: "Hero" }],
      location: { id: "forest", name: "Forest" },
    });

    for (const panel of result.panels) {
      expect(panel.microAction).not.toMatch(/generic|placeholder|todo/i);
      expect(panel.microAction.length).toBeGreaterThan(10);
    }
  });

  it("should include visual subject for each panel", () => {
    const result = buildBeatMicroStoryboard({
      beatId: "beat-4",
      beatText: "Discussion animée au café.",
      beatType: "dialogue",
      panelCount: 2,
      characters: [
        { id: "a", name: "Alice" },
        { id: "b", name: "Bob" },
      ],
      location: { id: "cafe", name: "Café" },
    });

    for (const panel of result.panels) {
      expect(panel.visualSubject).toBeTruthy();
    }
  });
});

describe("assertPanelSpecificity", () => {
  it("should pass for specific panels", () => {
    const panels = [
      {
        microAction: "Marius se penche vers Maya, les sourcils froncés",
        narrativeRole: "reaction",
        visualSubject: "Marius gros plan",
      },
    ];

    expect(() => assertPanelSpecificity(panels, true)).not.toThrow();
  });

  it("should throw for generic panels in premium mode", () => {
    const panels = [
      {
        microAction: "Character does something",
        narrativeRole: "action",
        visualSubject: "scene",
      },
    ];

    expect(() => assertPanelSpecificity(panels, true)).toThrow();
  });

  it("should not throw in non-premium mode", () => {
    const panels = [
      {
        microAction: "generic action",
        narrativeRole: "action",
        visualSubject: "scene",
      },
    ];

    expect(() => assertPanelSpecificity(panels, false)).not.toThrow();
  });
});
