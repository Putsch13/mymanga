/**
 * pre-render-premium-qa.strict.test.ts
 *
 * P1.18 — Tests pour la QA pré-rendu stricte en mode premium.
 */

import { describe, it, expect } from "vitest";

interface PreRenderQaInput {
  isPremium: boolean;
  panels: Array<{
    panelNumber: number;
    hasSourceBeatId: boolean;
    hasCharacterCanon: boolean;
    hasPromptContract: boolean;
    hasTextContract: boolean;
    promptContainsRequiredElements: boolean;
  }>;
}

interface PreRenderQaResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  blockedPanels: number[];
}

function runPreRenderPremiumQa(input: PreRenderQaInput): PreRenderQaResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const blockedPanels: number[] = [];

  for (const panel of input.panels) {
    const panelErrors: string[] = [];

    if (!panel.hasSourceBeatId) {
      panelErrors.push(`panel_${panel.panelNumber}_missing_source_beat_id`);
    }

    if (!panel.hasCharacterCanon && input.isPremium) {
      panelErrors.push(`panel_${panel.panelNumber}_missing_character_canon`);
    }

    if (!panel.hasPromptContract && input.isPremium) {
      panelErrors.push(`panel_${panel.panelNumber}_missing_prompt_contract`);
    }

    if (!panel.hasTextContract) {
      warnings.push(`panel_${panel.panelNumber}_missing_text_contract`);
    }

    if (!panel.promptContainsRequiredElements && input.isPremium) {
      panelErrors.push(`panel_${panel.panelNumber}_prompt_missing_required_elements`);
    }

    if (panelErrors.length > 0 && input.isPremium) {
      blockedPanels.push(panel.panelNumber);
      errors.push(...panelErrors);
    } else if (panelErrors.length > 0) {
      warnings.push(...panelErrors);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    blockedPanels,
  };
}

function assertPreRenderPremiumQa(input: PreRenderQaInput): void {
  const result = runPreRenderPremiumQa(input);

  if (!result.passed && input.isPremium) {
    throw new Error(
      `E_PRE_RENDER_QA_FAILED: ${result.errors.length} errors, blocked panels: [${result.blockedPanels.join(", ")}]`
    );
  }
}

describe("runPreRenderPremiumQa", () => {
  it("should pass for valid panels in premium mode", () => {
    const result = runPreRenderPremiumQa({
      isPremium: true,
      panels: [
        {
          panelNumber: 1,
          hasSourceBeatId: true,
          hasCharacterCanon: true,
          hasPromptContract: true,
          hasTextContract: true,
          promptContainsRequiredElements: true,
        },
        {
          panelNumber: 2,
          hasSourceBeatId: true,
          hasCharacterCanon: true,
          hasPromptContract: true,
          hasTextContract: true,
          promptContainsRequiredElements: true,
        },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.blockedPanels).toHaveLength(0);
  });

  it("should block panels missing source beat id in premium mode", () => {
    const result = runPreRenderPremiumQa({
      isPremium: true,
      panels: [
        {
          panelNumber: 1,
          hasSourceBeatId: false,
          hasCharacterCanon: true,
          hasPromptContract: true,
          hasTextContract: true,
          promptContainsRequiredElements: true,
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.blockedPanels).toContain(1);
  });

  it("should block panels missing character canon in premium mode", () => {
    const result = runPreRenderPremiumQa({
      isPremium: true,
      panels: [
        {
          panelNumber: 3,
          hasSourceBeatId: true,
          hasCharacterCanon: false,
          hasPromptContract: true,
          hasTextContract: true,
          promptContainsRequiredElements: true,
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.errors).toContain("panel_3_missing_character_canon");
  });

  it("should only warn in non-premium mode", () => {
    const result = runPreRenderPremiumQa({
      isPremium: false,
      panels: [
        {
          panelNumber: 1,
          hasSourceBeatId: false,
          hasCharacterCanon: false,
          hasPromptContract: false,
          hasTextContract: false,
          promptContainsRequiredElements: false,
        },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.blockedPanels).toHaveLength(0);
  });
});

describe("assertPreRenderPremiumQa", () => {
  it("should throw for failed QA in premium mode", () => {
    expect(() =>
      assertPreRenderPremiumQa({
        isPremium: true,
        panels: [
          {
            panelNumber: 1,
            hasSourceBeatId: false,
            hasCharacterCanon: false,
            hasPromptContract: false,
            hasTextContract: false,
            promptContainsRequiredElements: false,
          },
        ],
      })
    ).toThrow(/E_PRE_RENDER_QA_FAILED/);
  });

  it("should not throw in non-premium mode", () => {
    expect(() =>
      assertPreRenderPremiumQa({
        isPremium: false,
        panels: [
          {
            panelNumber: 1,
            hasSourceBeatId: false,
            hasCharacterCanon: false,
            hasPromptContract: false,
            hasTextContract: false,
            promptContainsRequiredElements: false,
          },
        ],
      })
    ).not.toThrow();
  });
});
