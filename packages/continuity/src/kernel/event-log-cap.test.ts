/**
 * Tests TODO-3 (CRITIQUE) — Préservation des events irréversibles dans l'eventLog.
 *
 * Le bug critique : avant ce helper, un `slice(0, 40)` ou `slice(0, 60)`
 * faisait sortir les events `death` du buffer après assez de chapitres.
 * Conséquence : un personnage mort pouvait être ressuscité sans que la
 * validation kernel ne bloque.
 */
import { describe, it, expect } from "vitest";
import { capEventLogPreservingIrreversible } from "./event-log-cap";
import type { EventLedgerEntry } from "../types";

function buildEvent(
  id: string,
  irreversible: boolean,
  chapterNumber: number,
  eventType = "scene_snapshot",
): EventLedgerEntry {
  return {
    eventId: id,
    chapterId: `chap-${chapterNumber}`,
    sceneId: null,
    chapterNumber,
    sceneNumber: null,
    eventType,
    title: `Event ${id}`,
    description: `desc-${id}`,
    actorIds: [],
    location: null,
    consequences: [],
    objectsGained: [],
    objectsLost: [],
    injuriesApplied: [],
    injuriesResolved: [],
    relationshipChanges: [],
    continuityFlags: [],
    irreversible,
    importance: "minor",
  };
}

describe("capEventLogPreservingIrreversible", () => {
  it("retourne [] si cap = 0", () => {
    const events = [buildEvent("a", true, 1), buildEvent("b", false, 2)];
    expect(capEventLogPreservingIrreversible(events, 0)).toEqual([]);
  });

  it("préserve TOUS les events irréversibles même au-delà du cap", () => {
    // Simule 50 chapitres, tous avec un event death (irréversible)
    const events: EventLedgerEntry[] = [];
    for (let i = 50; i >= 1; i--) {
      events.push(buildEvent(`death-${i}`, true, i, "death"));
    }
    // Cap arbitraire de 40 (ancienne valeur du slice)
    const result = capEventLogPreservingIrreversible(events, 40);

    // Le helper doit garder les 50 deaths même si cap=40
    expect(result.filter((e) => e.eventType === "death")).toHaveLength(50);
  });

  it("complète avec les events réversibles RÉCENTS jusqu'au cap", () => {
    const events: EventLedgerEntry[] = [
      buildEvent("rev-100", false, 100), // récent
      buildEvent("rev-99", false, 99),
      buildEvent("death-1", true, 1, "death"), // ancien et irréversible
      buildEvent("rev-98", false, 98),
      buildEvent("rev-97", false, 97),
    ];
    const result = capEventLogPreservingIrreversible(events, 4);

    expect(result).toHaveLength(4);
    expect(result.map((e) => e.eventId)).toContain("death-1");
    expect(result.map((e) => e.eventId)).toContain("rev-100");
    expect(result.map((e) => e.eventId)).toContain("rev-99");
    expect(result.map((e) => e.eventId)).toContain("rev-98");
    expect(result.map((e) => e.eventId)).not.toContain("rev-97");
  });

  it("dédoublonne par eventId", () => {
    const events: EventLedgerEntry[] = [
      buildEvent("a", false, 5),
      buildEvent("a", true, 5), // doublon — la première occurrence gagne
      buildEvent("b", false, 4),
    ];
    const result = capEventLogPreservingIrreversible(events, 10);
    expect(result).toHaveLength(2);
    expect(result.find((e) => e.eventId === "a")?.irreversible).toBe(false);
  });

  it("préserve l'ordre relatif d'origine (DESC chapter)", () => {
    const events: EventLedgerEntry[] = [
      buildEvent("c10", false, 10),
      buildEvent("c9-death", true, 9, "death"),
      buildEvent("c8", false, 8),
      buildEvent("c1-death", true, 1, "death"),
    ];
    const result = capEventLogPreservingIrreversible(events, 10);
    expect(result.map((e) => e.eventId)).toEqual([
      "c10",
      "c9-death",
      "c8",
      "c1-death",
    ]);
  });

  it("scénario réel : 50 chapitres avec 1 death isolée + 200 events réversibles → death conservée", () => {
    const events: EventLedgerEntry[] = [];
    // 200 events réversibles récents (chapter 50→1, plusieurs par chapitre)
    for (let i = 200; i >= 1; i--) {
      events.push(buildEvent(`rev-${i}`, false, i));
    }
    // 1 death au chapitre 1 (le plus ancien) — devrait être conservée
    events.push(buildEvent("death-ancestor", true, 0, "death"));

    const result = capEventLogPreservingIrreversible(events, 40);

    expect(result.find((e) => e.eventId === "death-ancestor")).toBeDefined();
    expect(result).toHaveLength(40);
  });
});
