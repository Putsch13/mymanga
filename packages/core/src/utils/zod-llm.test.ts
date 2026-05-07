import { describe, it, expect } from "vitest";
import { zodLlmEnum } from "./zod-llm";

describe("zodLlmEnum", () => {
  const schema = zodLlmEnum(["low", "medium", "high"]);

  it("accepts a normal string value", () => {
    expect(schema.parse("low")).toBe("low");
    expect(schema.parse("high")).toBe("high");
  });

  it("normalizes a single-element array to a scalar", () => {
    expect(schema.parse(["medium"])).toBe("medium");
    expect(schema.parse(["low"])).toBe("low");
  });

  it("trims whitespace from string values", () => {
    expect(schema.parse("  high  ")).toBe("high");
  });

  it("rejects invalid values", () => {
    expect(() => schema.parse("invalid")).toThrow();
    expect(() => schema.parse(42)).toThrow();
    expect(() => schema.parse(null)).toThrow();
  });

  it("rejects empty arrays", () => {
    expect(() => schema.parse([])).toThrow();
  });
});
