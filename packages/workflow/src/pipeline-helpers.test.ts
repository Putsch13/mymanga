import { describe, it, expect } from "vitest";
import {
  extractSceneFactions,
  inferSceneWeather,
  inferSceneTimeOfDay,
  isHttpImageUrl,
  isAlreadyStableStorageUrl,
  isDataUrl,
  looksLikeBflDelivery,
  uniq,
  asRecord,
} from "./pipeline-helpers";

describe("extractSceneFactions", () => {
  it("detects guild", () => {
    expect(extractSceneFactions("la guilde des marchands")).toContain("guilde");
  });
  it("detects rebels", () => {
    expect(extractSceneFactions("les rebelles du nord")).toContain("rebelles");
  });
  it("returns empty for no factions", () => {
    expect(extractSceneFactions("une rue calme")).toHaveLength(0);
  });
});

describe("inferSceneWeather", () => {
  it("detects rain", () => expect(inferSceneWeather("il pleut sous la pluie")).toBe("rain"));
  it("detects snow", () => expect(inferSceneWeather("neige et blizzard")).toBe("snow"));
  it("detects dust", () => expect(inferSceneWeather("poussière partout")).toBe("dust"));
  it("detects mist", () => expect(inferSceneWeather("brouillard dense")).toBe("mist"));
  it("returns null for clear weather", () => expect(inferSceneWeather("soleil")).toBeNull());
});

describe("inferSceneTimeOfDay", () => {
  it("detects night", () => expect(inferSceneTimeOfDay("la nuit tombée")).toBe("night"));
  it("detects dawn", () => expect(inferSceneTimeOfDay("à l'aube")).toBe("dawn"));
  it("detects sunset", () => expect(inferSceneTimeOfDay("le crépuscule")).toBe("sunset"));
  it("defaults to day", () => expect(inferSceneTimeOfDay("le marché")).toBe("day"));
});

describe("URL helpers", () => {
  it("isHttpImageUrl validates https", () => expect(isHttpImageUrl("https://example.com/img.jpg")).toBe(true));
  it("isHttpImageUrl rejects non-url", () => expect(isHttpImageUrl("not a url")).toBe(false));
  it("isDataUrl detects data URLs", () => expect(isDataUrl("data:image/png;base64,abc")).toBe(true));
  it("isDataUrl rejects normal URLs", () => expect(isDataUrl("https://example.com")).toBe(false));
  it("looksLikeBflDelivery detects BFL", () => expect(looksLikeBflDelivery("https://delivery-123.bfl.ai/img.jpg")).toBe(true));
  it("looksLikeBflDelivery rejects others", () => expect(looksLikeBflDelivery("https://fal.ai/img.jpg")).toBe(false));
});

describe("uniq", () => {
  it("removes duplicates and nulls", () => {
    expect(uniq(["a", "b", "a", null, undefined, "c"])).toEqual(["a", "b", "c"]);
  });
  it("returns empty for all nulls", () => {
    expect(uniq([null, undefined])).toEqual([]);
  });
});

describe("asRecord", () => {
  it("returns object as-is", () => expect(asRecord({ a: 1 })).toEqual({ a: 1 }));
  it("returns empty record for null", () => expect(asRecord(null)).toEqual({}));
  it("returns empty record for array", () => expect(asRecord([1, 2])).toEqual({}));
  it("returns empty record for string", () => expect(asRecord("hello")).toEqual({}));
});
