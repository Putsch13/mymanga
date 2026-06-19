/**
 * Sprint 1 — Reader refacto
 *
 * Tests de la whitelist / normalisation des formats projet.
 */

import { describe, expect, it } from "vitest";
import {
  SUPPORTED_PROJECT_FORMATS,
  normalizeProjectFormat,
  isSupportedProjectFormat,
} from "../lib/project-format";

describe("project format whitelist", () => {
  it("n'expose que manga + webtoon", () => {
    expect(SUPPORTED_PROJECT_FORMATS).toEqual(["manga", "webtoon"]);
  });

  it("normalizeProjectFormat : manga / webtoon préservés", () => {
    expect(normalizeProjectFormat("manga")).toBe("manga");
    expect(normalizeProjectFormat("webtoon")).toBe("webtoon");
  });

  it("normalizeProjectFormat : legacy 'roman graphique' → manga", () => {
    expect(normalizeProjectFormat("roman graphique")).toBe("manga");
  });

  it("normalizeProjectFormat : null / undefined / valeurs libres → manga", () => {
    expect(normalizeProjectFormat(null)).toBe("manga");
    expect(normalizeProjectFormat(undefined)).toBe("manga");
    expect(normalizeProjectFormat("")).toBe("manga");
    expect(normalizeProjectFormat("truc aléatoire")).toBe("manga");
  });

  it("isSupportedProjectFormat : true uniquement pour manga/webtoon", () => {
    expect(isSupportedProjectFormat("manga")).toBe(true);
    expect(isSupportedProjectFormat("webtoon")).toBe(true);
    expect(isSupportedProjectFormat("roman graphique")).toBe(false);
    expect(isSupportedProjectFormat(null)).toBe(false);
    expect(isSupportedProjectFormat(undefined)).toBe(false);
  });
});
