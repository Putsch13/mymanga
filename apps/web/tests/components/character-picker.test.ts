import { describe, it, expect } from "vitest";

// Tests unitaires de la logique CharacterPicker sans rendu DOM

type Character = {
  id: string;
  name: string;
  roleType?: string | null;
  imageUrl?: string | null;
};

function roleLabel(roleType: string | null | undefined): string {
  if (!roleType) return "";
  const map: Record<string, string> = {
    hero: "Héros",
    protagonist: "Protagoniste",
    antagonist: "Antagoniste",
    villain: "Villain",
    support: "Soutien",
    npc: "PNJ",
    minor: "Secondaire",
  };
  return map[roleType.toLowerCase()] ?? roleType;
}

function toggleSingle(current: string | null, id: string): string | null {
  return current === id ? null : id;
}

function toggleMultiple(current: string[], id: string): string[] {
  if (current.includes(id)) return current.filter((v) => v !== id);
  return [...current, id];
}

function filterCharacters(characters: Character[], search: string): Character[] {
  const q = search.toLowerCase();
  return characters.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.roleType ?? "").toLowerCase().includes(q),
  );
}

const CHARACTERS: Character[] = [
  { id: "char-1", name: "Ryuu", roleType: "hero" },
  { id: "char-2", name: "Kira", roleType: "antagonist" },
  { id: "char-3", name: "Sora", roleType: "support" },
];

describe("CharacterPicker — logique pure", () => {
  it("traduit le rôle hero en Héros", () => {
    expect(roleLabel("hero")).toBe("Héros");
  });

  it("traduit le rôle antagonist en Antagoniste", () => {
    expect(roleLabel("antagonist")).toBe("Antagoniste");
  });

  it("traduit le rôle support en Soutien", () => {
    expect(roleLabel("support")).toBe("Soutien");
  });

  it("retourne le roleType brut si inconnu", () => {
    expect(roleLabel("custom_role")).toBe("custom_role");
  });

  it("retourne une chaîne vide si roleType est null", () => {
    expect(roleLabel(null)).toBe("");
  });

  it("sélectionne un personnage en mode single", () => {
    expect(toggleSingle(null, "char-1")).toBe("char-1");
  });

  it("désélectionne un personnage déjà sélectionné en mode single", () => {
    expect(toggleSingle("char-1", "char-1")).toBeNull();
  });

  it("ajoute un personnage en mode multiple", () => {
    expect(toggleMultiple(["char-1"], "char-2")).toEqual(["char-1", "char-2"]);
  });

  it("retire un personnage déjà sélectionné en mode multiple", () => {
    expect(toggleMultiple(["char-1", "char-2"], "char-1")).toEqual(["char-2"]);
  });

  it("filtre les personnages par nom", () => {
    const result = filterCharacters(CHARACTERS, "ryuu");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("char-1");
  });

  it("filtre les personnages par rôle", () => {
    const result = filterCharacters(CHARACTERS, "antag");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("char-2");
  });

  it("retourne tous les personnages si la recherche est vide", () => {
    const result = filterCharacters(CHARACTERS, "");
    expect(result).toHaveLength(3);
  });

  it("renvoie l'ID interne, pas le nom visible", () => {
    const selected = toggleSingle(null, "char-1");
    expect(selected).toBe("char-1");
    const char = CHARACTERS.find((c) => c.id === selected);
    expect(char?.name).toBe("Ryuu");
  });
});
