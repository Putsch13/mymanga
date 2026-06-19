import { describe, expect, it } from "vitest";
import { inferRelationshipShift } from "./validate-scene-snapshot";

describe("inferRelationshipShift (TODO-9)", () => {
  // Cas legacy déjà gérés (toujours verts).
  it("matche les verbes existants pardonne/trahit/avoue/confesse/promet", () => {
    expect(inferRelationshipShift("Lux pardonne sa trahison")).toBe(true);
    expect(inferRelationshipShift("Il trahit son ami d'enfance")).toBe(true);
    expect(inferRelationshipShift("Elle avoue ses sentiments")).toBe(true);
    expect(inferRelationshipShift("Il confesse son amour")).toBe(true);
    expect(inferRelationshipShift("Il promet de revenir")).toBe(true);
  });

  // Cas TODO-9 : verbes romance / rupture qui faisaient des faux warnings.
  it("matche les verbes romance / rupture (embrasse, rejette, déclare, etc.)", () => {
    expect(inferRelationshipShift("Lux embrasse Kai sous la pluie")).toBe(true);
    expect(inferRelationshipShift("Kai rejette les avances de Lux")).toBe(true);
    expect(inferRelationshipShift("Il repousse sa main sans un mot")).toBe(true);
    expect(inferRelationshipShift("Ils se réconcilient enfin")).toBe(true);
    expect(inferRelationshipShift("Elle est jalouse de leur complicité")).toBe(true);
    expect(inferRelationshipShift("Une dispute éclate")).toBe(true);
    expect(inferRelationshipShift("Il rompt avec elle ce matin")).toBe(true);
    expect(inferRelationshipShift("La rupture est consommée")).toBe(true);
    expect(inferRelationshipShift("Lux déclare son amour à Kai")).toBe(true);
    expect(inferRelationshipShift("Une déclaration en pleine tempête")).toBe(true);
    expect(inferRelationshipShift("Il l'enlace doucement")).toBe(true);
  });

  it("ne matche PAS un résumé neutre sans verbe relationnel", () => {
    expect(inferRelationshipShift("Lux marche sur le port en pensant au passé")).toBe(false);
    expect(inferRelationshipShift("Le soleil se couche derrière la falaise")).toBe(false);
  });

  // Régression : la version pré-TODO-9 n'aurait pas matché ces phrases.
  // (le but est de garantir qu'on ne régresse jamais ces matches).
  it("non-régression TODO-9 : 'embrasse' / 'rejette' / 'déclare' sont reconnus", () => {
    expect(inferRelationshipShift("embrasse")).toBe(true);
    expect(inferRelationshipShift("rejette")).toBe(true);
    expect(inferRelationshipShift("déclare")).toBe(true);
  });
});
