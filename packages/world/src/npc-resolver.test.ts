/**
 * P0.2 — Tests de la validation Zod de la sortie IA PNJ.
 *
 * Couvre :
 *   - payload valide accepté,
 *   - JSON malformé rejeté,
 *   - JSON valide mais schéma incomplet rejeté,
 *   - champs vides ou trop longs rejetés,
 *   - `buildControlledNpcFallback` produit toujours un NPC valide,
 *   - `resolveNpcWithAiFallback` tombe en fallback contrôlé si le LLM échoue
 *     ou produit une sortie invalide.
 */
import { describe, it, expect } from "vitest";
import {
  parseAiGeneratedNpc,
  buildControlledNpcFallback,
  resolveNpcWithAiFallback,
  aiGeneratedNpcSchema,
} from "./npc-resolver";

const validPayload = {
  label: "garde impérial",
  role: "guard",
  visualCues: ["armure sombre", "longue lance", "regard dur"],
  interactionHooks: [
    "bloque le passage au héros",
    "exige un laissez-passer",
    "surveille les issues",
  ],
  promptFragment: "stoic imperial guard, dark plate armor, long spear, stern face",
  narrativeHook: "Le garde impose une tension immédiate et oblige le héros à ruser.",
};

describe("parseAiGeneratedNpc — payload valide", () => {
  it("accepte un payload JSON conforme", () => {
    const r = parseAiGeneratedNpc(JSON.stringify(validPayload));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.npc.label).toBe("garde impérial");
      expect(r.npc.visualCues).toHaveLength(3);
    }
  });

  it("strip les fences ```json correctement", () => {
    const fenced = "```json\n" + JSON.stringify(validPayload) + "\n```";
    const r = parseAiGeneratedNpc(fenced);
    expect(r.ok).toBe(true);
  });
});

describe("parseAiGeneratedNpc — payload invalide", () => {
  it("rejette un JSON malformé", () => {
    const r = parseAiGeneratedNpc("{{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("json_parse");
  });

  it("rejette une valeur non-objet (array)", () => {
    const r = parseAiGeneratedNpc(JSON.stringify(["not", "an", "object"]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("json_not_object");
  });

  it("rejette un schéma partiel (champ manquant)", () => {
    const partial = { ...validPayload };
    delete (partial as Record<string, unknown>).promptFragment;
    const r = parseAiGeneratedNpc(JSON.stringify(partial));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_invalid");
  });

  it("rejette un label vide", () => {
    const r = parseAiGeneratedNpc(JSON.stringify({ ...validPayload, label: "   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_invalid");
  });

  it("rejette des visualCues vides (tableau vide)", () => {
    const r = parseAiGeneratedNpc(JSON.stringify({ ...validPayload, visualCues: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_invalid");
  });

  it("rejette un label trop long", () => {
    const r = parseAiGeneratedNpc(JSON.stringify({ ...validPayload, label: "x".repeat(200) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_invalid");
  });

  it("rejette plus de 6 interactionHooks", () => {
    const tooMany = Array.from({ length: 7 }, (_, i) => `hook ${i}`);
    const r = parseAiGeneratedNpc(JSON.stringify({ ...validPayload, interactionHooks: tooMany }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("schema_invalid");
  });
});

describe("buildControlledNpcFallback", () => {
  it("produit un NPC qui passe le schéma Zod", () => {
    const fallback = buildControlledNpcFallback({ rawDescription: "un soldat blessé" });
    expect(() => aiGeneratedNpcSchema.parse(fallback)).not.toThrow();
    expect(fallback.role).toBe("unknown");
  });

  it("supporte une description vide sans crasher", () => {
    const fallback = buildControlledNpcFallback({ rawDescription: "" });
    expect(() => aiGeneratedNpcSchema.parse(fallback)).not.toThrow();
    expect(fallback.label).toBe("personnage inconnu");
  });

  it("tronque les labels trop longs", () => {
    const fallback = buildControlledNpcFallback({ rawDescription: "x".repeat(500) });
    expect(fallback.label.length).toBeLessThanOrEqual(80);
  });
});

describe("resolveNpcWithAiFallback — bout à bout", () => {
  it("renvoie le NPC validé quand la sortie IA est conforme", async () => {
    const npc = await resolveNpcWithAiFallback(
      { rawDescription: "garde", universe: "dark fantasy", tone: "grim" },
      async () => JSON.stringify(validPayload),
    );
    expect(npc.label).toBe("garde impérial");
  });

  it("tombe en fallback contrôlé si la sortie IA est malformée", async () => {
    const npc = await resolveNpcWithAiFallback(
      { rawDescription: "marchand", universe: "shonen", tone: "adventure" },
      async () => "this is not json at all",
    );
    expect(npc.role).toBe("unknown");
    expect(npc.label).toContain("marchand");
    expect(() => aiGeneratedNpcSchema.parse(npc)).not.toThrow();
  });

  it("tombe en fallback contrôlé si le LLM throw", async () => {
    const npc = await resolveNpcWithAiFallback(
      { rawDescription: "medecin du village", universe: "isekai", tone: "cozy" },
      async () => {
        throw new Error("LLM_unavailable");
      },
    );
    expect(npc.role).toBe("unknown");
    expect(() => aiGeneratedNpcSchema.parse(npc)).not.toThrow();
  });

  it("tombe en fallback contrôlé si la sortie IA passe le JSON.parse mais rate le schéma", async () => {
    const invalidButParseable = JSON.stringify({
      label: "garde",
      role: "guard",
      visualCues: [],
      interactionHooks: [],
      promptFragment: "",
      narrativeHook: "",
    });
    const npc = await resolveNpcWithAiFallback(
      { rawDescription: "garde", universe: "x", tone: "y" },
      async () => invalidButParseable,
    );
    expect(npc.role).toBe("unknown");
    expect(() => aiGeneratedNpcSchema.parse(npc)).not.toThrow();
  });
});
