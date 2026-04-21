/**
 * Sprint 1 — Reader refacto
 *
 * Tests du viewport controller : le fix "full-page croppe" repose sur le
 * bon choix de `object-fit: contain` (pas cover) en mode fit-page.
 */

import { describe, expect, it } from "vitest";
import {
  READER_VIEWPORT_MODES,
  DEFAULT_VIEWPORT_MODE,
  cycleViewportMode,
  getViewportStyle,
  getViewportModeLabel,
} from "../components/manga/reader/reader-viewport-controller";

describe("reader viewport controller", () => {
  it("mode par défaut = fit-page", () => {
    expect(DEFAULT_VIEWPORT_MODE).toBe("fit-page");
  });

  it("expose exactement 3 modes", () => {
    expect(READER_VIEWPORT_MODES).toHaveLength(3);
    expect(READER_VIEWPORT_MODES).toEqual(["fit-page", "fit-width", "panel-focus"]);
  });

  it("fit-page → objectFit: contain (fix crop haut de page)", () => {
    const style = getViewportStyle("fit-page");
    expect(style.content.objectFit).toBe("contain");
    expect(style.content.objectFit).not.toBe("cover");
  });

  it("fit-page → conteneur centré, overflow caché", () => {
    const { container } = getViewportStyle("fit-page");
    expect(container.display).toBe("flex");
    expect(container.alignItems).toBe("center");
    expect(container.justifyContent).toBe("center");
    expect(container.overflow).toBe("hidden");
  });

  it("fit-width → scroll vertical activé", () => {
    const { container, content } = getViewportStyle("fit-width");
    expect(container.overflowY).toBe("auto");
    expect(content.width).toBe("100%");
    expect(content.objectFit).toBe("contain");
  });

  it("panel-focus → max 95% viewport", () => {
    const { content } = getViewportStyle("panel-focus");
    expect(content.maxWidth).toBe("95%");
    expect(content.maxHeight).toBe("95%");
    expect(content.objectFit).toBe("contain");
  });

  it("cycleViewportMode : fit-page → fit-width → panel-focus → fit-page", () => {
    expect(cycleViewportMode("fit-page")).toBe("fit-width");
    expect(cycleViewportMode("fit-width")).toBe("panel-focus");
    expect(cycleViewportMode("panel-focus")).toBe("fit-page");
  });

  it("labels FR pour chaque mode", () => {
    expect(getViewportModeLabel("fit-page")).toBe("Page entière");
    expect(getViewportModeLabel("fit-width")).toBe("Largeur pleine");
    expect(getViewportModeLabel("panel-focus")).toBe("Panel zoom");
  });
});
