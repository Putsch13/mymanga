import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetAppConfigForTests, getAppConfig } from "./app-config";

const ORIGINAL_ENV = { ...process.env };

describe("app-config singleton", () => {
  beforeEach(() => {
    _resetAppConfigForTests();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    _resetAppConfigForTests();
    process.env = { ...ORIGINAL_ENV };
  });

  it("retourne les defaults pour les vars optionnelles non définies", () => {
    delete process.env.OPENAI_NARRATIVE_MODEL;
    delete process.env.OPENAI_DIALOGUE_MODEL;
    delete process.env.STORAGE_BUCKET;
    const cfg = getAppConfig();
    expect(cfg.OPENAI_NARRATIVE_MODEL).toBe("gpt-4o");
    expect(cfg.OPENAI_DIALOGUE_MODEL).toBe("gpt-4o-mini");
    expect(cfg.STORAGE_BUCKET).toBe("MyManga");
  });

  it("respecte les overrides explicites via process.env", () => {
    process.env.OPENAI_NARRATIVE_MODEL = "gpt-5-turbo";
    process.env.OPENAI_DIALOGUE_MODEL = "claude-opus";
    const cfg = getAppConfig();
    expect(cfg.OPENAI_NARRATIVE_MODEL).toBe("gpt-5-turbo");
    expect(cfg.OPENAI_DIALOGUE_MODEL).toBe("claude-opus");
  });

  it("retourne undefined pour FAL_KEY si non défini (fallback gracieux)", () => {
    delete process.env.FAL_KEY;
    delete process.env.FAL_API_KEY;
    const cfg = getAppConfig();
    expect(cfg.FAL_KEY).toBeUndefined();
    expect(cfg.FAL_API_KEY).toBeUndefined();
  });

  it("cache l'instance entre deux appels (singleton)", () => {
    process.env.OPENAI_NARRATIVE_MODEL = "first";
    const a = getAppConfig();
    process.env.OPENAI_NARRATIVE_MODEL = "second";
    const b = getAppConfig();
    expect(a).toBe(b);
    expect(b.OPENAI_NARRATIVE_MODEL).toBe("first");
  });

  it("crash en production si DATABASE_URL est absent", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    expect(() => getAppConfig()).toThrow(/DATABASE_URL required in production/);
  });

  it("ne crash pas en development si DATABASE_URL est absent", () => {
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_URL;
    expect(() => getAppConfig()).not.toThrow();
  });

  it("rejette une URL invalide pour DATABASE_URL", () => {
    process.env.DATABASE_URL = "not-a-url";
    expect(() => getAppConfig()).toThrow(/invalid_env/);
  });
});
