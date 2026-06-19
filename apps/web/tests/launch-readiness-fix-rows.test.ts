import { describe, expect, it } from "vitest";
import {
  canonReadinessPremiumErrorsToFixRows,
  premiumReadinessBlockedIssuesToFixRows,
  premiumReadinessDashboardBaseMessage,
} from "@/lib/studio/launch-readiness-fix-rows";

describe("launch-readiness-fix-rows (P1.3)", () => {
  describe("premiumReadinessDashboardBaseMessage", () => {
    it("retourne le message payload s’il est non vide", () => {
      expect(premiumReadinessDashboardBaseMessage("  Custom  ")).toBe("  Custom  ");
    });

    it("retombe sur l’intro par défaut si message absent ou vide", () => {
      expect(premiumReadinessDashboardBaseMessage(undefined)).toContain("checklist");
      expect(premiumReadinessDashboardBaseMessage("")).toContain("checklist");
      expect(premiumReadinessDashboardBaseMessage("   ")).toContain("checklist");
    });
  });

  describe("premiumReadinessBlockedIssuesToFixRows", () => {
    it("ignore les issues non blocked et mappe fixAction", () => {
      const rows = premiumReadinessBlockedIssuesToFixRows([
        { message: "A", severity: "warning", fixAction: { label: "L1", href: "/a" } },
        { message: "B", severity: "blocked", fixAction: { label: "Aller au studio", href: "/projects/p/c/edit" } },
      ]);
      expect(rows).toEqual([
        {
          message: "B",
          fixLabel: "Aller au studio",
          fixHref: "/projects/p/c/edit",
        },
      ]);
    });

    it("retourne null si aucune issue blocked", () => {
      expect(premiumReadinessBlockedIssuesToFixRows([{ message: "W", severity: "warning" }])).toBeNull();
      expect(premiumReadinessBlockedIssuesToFixRows([])).toBeNull();
      expect(premiumReadinessBlockedIssuesToFixRows(undefined)).toBeNull();
    });

    it("plafonne à 12 lignes", () => {
      const issues = Array.from({ length: 20 }, (_, i) => ({
        message: `m${i}`,
        severity: "blocked" as const,
      }));
      const rows = premiumReadinessBlockedIssuesToFixRows(issues);
      expect(rows).toHaveLength(12);
      expect(rows?.[11]?.message).toBe("m11");
    });

    it("utilise le libellé « Blocage » si message absent", () => {
      expect(premiumReadinessBlockedIssuesToFixRows([{ severity: "blocked" }])?.[0]?.message).toBe("Blocage");
    });
  });

  describe("canonReadinessPremiumErrorsToFixRows", () => {
    it("mappe userMessage et fixAction", () => {
      expect(
        canonReadinessPremiumErrorsToFixRows([
          {
            userMessage: "Réf manquante",
            fixAction: { label: "Canon", href: "/projects/x/characters/y" },
          },
        ]),
      ).toEqual([
        { message: "Réf manquante", fixLabel: "Canon", fixHref: "/projects/x/characters/y" },
      ]);
    });

    it("retourne null pour tableau vide ou non-tableau", () => {
      expect(canonReadinessPremiumErrorsToFixRows([])).toBeNull();
      expect(canonReadinessPremiumErrorsToFixRows(null)).toBeNull();
      expect(canonReadinessPremiumErrorsToFixRows({})).toBeNull();
    });

    it("fallback message « Point canon » si userMessage absent", () => {
      expect(canonReadinessPremiumErrorsToFixRows([{ fixAction: { label: "X", href: "/" } }])?.[0]?.message).toBe(
        "Point canon",
      );
    });
  });
});
