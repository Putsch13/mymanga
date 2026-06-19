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
 *   - `resolveNpcWithAI` appelle l’IA sans candidats catalogue, puis avec hints,
 *     puis catalogue local.
 */
import { describe, it, expect } from "vitest";
import {
  parseAiGeneratedNpc,
  buildControlledNpcFallback,
  resolveNpcWithAiFallback,
  resolveNpcWithAI,
  aiGeneratedNpcSchema,
} from "./npc-resolver";
import type { ProceduralEntity } from "./types";
import { buildFixedRegressionSuite } from "./qa-suites";

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

const minimalProceduralNpc = (id: string, label: string, sourceOntologyId: string): ProceduralEntity => ({
  id,
  label,
  kind: "npc",
  role: "extra",
  visualCues: ["silhouette lisible"],
  interactionHooks: ["présence de fond"],
  sourceOntologyId,
});

describe("resolveNpcWithAI — ordre IA d’abord", () => {
  const blueprintInput = () => buildFixedRegressionSuite()[0]!.input;

  it("utilise la sortie IA du premier appel (candidats vides) sans passer par le catalogue", async () => {
    const r = await resolveNpcWithAI(
      blueprintInput(),
      7,
      async (_input, candidates) => {
        expect(candidates).toHaveLength(0);
        return [minimalProceduralNpc("ai-only", "PNJ sur mesure", "ai-generated")];
      },
      1,
    );
    expect(r.source).toBe("ai");
    expect(r.entities[0]?.label).toBe("PNJ sur mesure");
  });

  it("enchaîne premier appel vide puis second appel avec hints catalogue", async () => {
    const phases: string[] = [];
    const r = await resolveNpcWithAI(
      blueprintInput(),
      11,
      async (_input, candidates) => {
        phases.push(candidates.length === 0 ? "primary_no_catalog" : "hinted_with_catalog");
        if (candidates.length === 0) return [];
        return [minimalProceduralNpc("hint-1", "Depuis indices", "hint")];
      },
      1,
    );
    expect(phases).toEqual(["primary_no_catalog", "hinted_with_catalog"]);
    expect(r.source).toBe("ai");
    expect(r.entities[0]?.label).toBe("Depuis indices");
  });

  it("replie sur le catalogue local si l’IA ne renvoie rien", async () => {
    const r = await resolveNpcWithAI(
      blueprintInput(),
      99,
      async () => [],
      1,
    );
    expect(r.source).toBe("local");
    expect(r.entities.length).toBeGreaterThan(0);
  });

  it("si le premier appel IA throw, tente le second passage puis catalogue", async () => {
    let n = 0;
    const r = await resolveNpcWithAI(
      blueprintInput(),
      3,
      async (_input, candidates) => {
        n += 1;
        if (candidates.length === 0) throw new Error("primary_fail");
        return [minimalProceduralNpc("recover", "Récupéré", "ai-recover")];
      },
      1,
    );
    expect(n).toBe(2);
    expect(r.source).toBe("ai");
    expect(r.entities[0]?.label).toBe("Récupéré");
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
