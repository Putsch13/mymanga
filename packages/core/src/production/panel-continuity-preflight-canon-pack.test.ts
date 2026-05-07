import { describe, it, expect } from "vitest";
import {
  canonPackPreflightBlockingReasons,
  type CharacterCanonPackCheck,
} from "./panel-continuity-preflight";

describe("canonPackPreflightBlockingReasons (T7)", () => {
  it("blocks when hero has no canon pack", () => {
    const chars: CharacterCanonPackCheck[] = [
      { characterId: "c1", roleType: "hero", hasCanonPack: false, canonPackCompleteness: 0 },
    ];
    const blockers = canonPackPreflightBlockingReasons(chars);
    expect(blockers).toContain("canon_pack_incomplete:c1");
  });

  it("blocks when protagonist has incomplete pack (< 0.5)", () => {
    const chars: CharacterCanonPackCheck[] = [
      { characterId: "c2", roleType: "protagonist", hasCanonPack: true, canonPackCompleteness: 0.3 },
    ];
    const blockers = canonPackPreflightBlockingReasons(chars);
    expect(blockers).toContain("canon_pack_incomplete:c2");
  });

  it("does not block when hero has good completeness", () => {
    const chars: CharacterCanonPackCheck[] = [
      { characterId: "c3", roleType: "hero", hasCanonPack: true, canonPackCompleteness: 0.85 },
    ];
    const blockers = canonPackPreflightBlockingReasons(chars);
    expect(blockers).toHaveLength(0);
  });

  it("ignores non-main cast", () => {
    const chars: CharacterCanonPackCheck[] = [
      { characterId: "c4", roleType: "supporting", hasCanonPack: false, canonPackCompleteness: 0 },
    ];
    const blockers = canonPackPreflightBlockingReasons(chars);
    expect(blockers).toHaveLength(0);
  });

  it("blocks deuteragonist with incomplete pack", () => {
    const chars: CharacterCanonPackCheck[] = [
      { characterId: "c5", roleType: "deuteragonist", hasCanonPack: true, canonPackCompleteness: 0.4 },
    ];
    const blockers = canonPackPreflightBlockingReasons(chars);
    expect(blockers).toContain("canon_pack_incomplete:c5");
  });

  it("respects custom minCompleteness threshold", () => {
    const chars: CharacterCanonPackCheck[] = [
      { characterId: "c6", roleType: "hero", hasCanonPack: true, canonPackCompleteness: 0.65 },
    ];
    const strict = canonPackPreflightBlockingReasons(chars, { minCompleteness: 0.7 });
    expect(strict).toContain("canon_pack_incomplete:c6");
    const lenient = canonPackPreflightBlockingReasons(chars, { minCompleteness: 0.5 });
    expect(lenient).toHaveLength(0);
  });
});
