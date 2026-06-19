import { afterEach, describe, expect, it } from "vitest";
import {
  getPremiumReadinessLaunchMinScore,
  PREMIUM_READINESS_LAUNCH_DEFAULT_MIN,
} from "./production-rules";

describe("getPremiumReadinessLaunchMinScore", () => {
  const prev = process.env.PREMIUM_READINESS_LAUNCH_MIN_SCORE;

  afterEach(() => {
    if (prev === undefined) delete process.env.PREMIUM_READINESS_LAUNCH_MIN_SCORE;
    else process.env.PREMIUM_READINESS_LAUNCH_MIN_SCORE = prev;
  });

  it("retourne 0,85 par défaut quand la variable est absente", () => {
    delete process.env.PREMIUM_READINESS_LAUNCH_MIN_SCORE;
    expect(getPremiumReadinessLaunchMinScore()).toBe(PREMIUM_READINESS_LAUNCH_DEFAULT_MIN);
    expect(PREMIUM_READINESS_LAUNCH_DEFAULT_MIN).toBe(0.85);
  });

  it("parse un nombre valide entre 0 et 1", () => {
    process.env.PREMIUM_READINESS_LAUNCH_MIN_SCORE = "0.85";
    expect(getPremiumReadinessLaunchMinScore()).toBe(0.85);
  });

  it("retombe sur le défaut pour une valeur invalide", () => {
    process.env.PREMIUM_READINESS_LAUNCH_MIN_SCORE = "nope";
    expect(getPremiumReadinessLaunchMinScore()).toBe(PREMIUM_READINESS_LAUNCH_DEFAULT_MIN);
    process.env.PREMIUM_READINESS_LAUNCH_MIN_SCORE = "1.5";
    expect(getPremiumReadinessLaunchMinScore()).toBe(PREMIUM_READINESS_LAUNCH_DEFAULT_MIN);
  });
});
