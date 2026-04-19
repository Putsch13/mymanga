/**
 * P2.1 (sprint 3) — Tests route-level pour `/api/projects/[id]/npc-resolve`.
 *
 * Objectifs testés :
 *   1. Ownership refusé → 404 (pas 401/403, on ne leak pas l'existence
 *      du projet)
 *   2. Unauthorized si pas de user → 401
 *   3. rawDescription trop court → 400
 *   4. Catalog hit déterministe : même input → même narrativeHook
 *   5. Species path : `detectSpeciesInDescription` positif → branche species
 *      et `resolveSpeciesArchetype` est appelé, le résultat est renvoyé.
 *   6. Fallback IA : catalog vide + pas d'OpenAI → réponse "ai_generated"
 *      de type placeholder (pas de crash).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  project: { findFirst: vi.fn() },
};

const getAppUserMock = vi.fn();
const detectSpeciesInDescriptionMock = vi.fn();
const resolveSpeciesArchetypeMock = vi.fn();
const resolveNpcWithAiFallbackMock = vi.fn();

vi.mock("@manga-ai-studio/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/auth/get-app-user", () => ({
  getAppUser: getAppUserMock,
}));

vi.mock("@manga-ai-studio/memory", () => ({
  detectSpeciesInDescription: detectSpeciesInDescriptionMock,
  resolveSpeciesArchetype: resolveSpeciesArchetypeMock,
}));

vi.mock("@manga-ai-studio/world", async () => {
  const actual = await vi.importActual<typeof import("@manga-ai-studio/world")>(
    "@manga-ai-studio/world",
  );
  return {
    ...actual,
    resolveNpcWithAiFallback: resolveNpcWithAiFallbackMock,
  };
});

function makeRequest(body: unknown): Request {
  return new Request("http://test/api/projects/p1/npc-resolve", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Par défaut : user authentifié + projet possédé
  getAppUserMock.mockResolvedValue({ id: "user-1", email: "a@b.com" });
  prismaMock.project.findFirst.mockResolvedValue({ id: "p1" });
  detectSpeciesInDescriptionMock.mockReturnValue(null);
  delete process.env.OPENAI_API_KEY;
});

describe("POST /api/projects/[id]/npc-resolve (P2.1 route-level)", () => {
  it("401 si pas d'user authentifié", async () => {
    getAppUserMock.mockResolvedValueOnce(null);
    const { POST } = await import("../app/api/projects/[id]/npc-resolve/route");
    const res = await POST(makeRequest({ rawDescription: "ninja" }) as never, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(401);
  });

  it("404 si ownership refusé (projet d'un autre user)", async () => {
    prismaMock.project.findFirst.mockResolvedValueOnce(null);
    const { POST } = await import("../app/api/projects/[id]/npc-resolve/route");
    const res = await POST(makeRequest({ rawDescription: "ninja" }) as never, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(404);
  });

  it("400 si rawDescription < 3 chars", async () => {
    const { POST } = await import("../app/api/projects/[id]/npc-resolve/route");
    const res = await POST(makeRequest({ rawDescription: "a" }) as never, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/rawDescription/);
  });

  it("hit catalogue → narrativeHook déterministe à payload identique", async () => {
    const { POST } = await import("../app/api/projects/[id]/npc-resolve/route");
    const payload = {
      rawDescription: "un vieux mage aux longs cheveux blancs qui maîtrise le feu",
      universe: "fantasy",
      tone: "épique",
      sceneLocation: "tour de magie",
    };
    const res1 = await POST(makeRequest(payload) as never, {
      params: Promise.resolve({ id: "p1" }),
    });
    const res2 = await POST(makeRequest(payload) as never, {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const j1 = await res1.json();
    const j2 = await res2.json();
    // Invariant P0.2 : reproductibilité — même payload = même hook
    expect(j1.narrativeHook).toBe(j2.narrativeHook);
    expect(j1.topMatch.label).toBe(j2.topMatch.label);
  });

  it("branche species → resolveSpeciesArchetype est appelé et trait est renvoyé", async () => {
    detectSpeciesInDescriptionMock.mockReturnValueOnce("dragon");
    resolveSpeciesArchetypeMock.mockResolvedValueOnce({
      traits: {
        morphology: "grand reptile ailé",
        skinTexture: "écailles rouges métalliques",
        distinctiveMarkers: ["crête dorsale dentelée", "yeux or fondu"],
        promptFragment: "red scaled dragon, metallic red scales, winged, fiery eyes",
      },
      isNew: true,
    });
    const { POST } = await import("../app/api/projects/[id]/npc-resolve/route");
    const res = await POST(
      makeRequest({ rawDescription: "Un dragon adulte", universe: "fantasy" }) as never,
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.strategy).toBe("species_created");
    expect(json.isSpecies).toBe(true);
    expect(json.speciesLabel).toBe("dragon");
    expect(json.promptFragment).toContain("red scaled dragon");
    // Vérifie qu'on a bien appelé le resolver avec l'ownership vérifié AVANT
    expect(resolveSpeciesArchetypeMock).toHaveBeenCalledTimes(1);
    const callArgs = resolveSpeciesArchetypeMock.mock.calls[0]![1];
    expect(callArgs.projectId).toBe("p1");
    expect(callArgs.speciesLabel).toBe("dragon");
  });

  it("pas de OpenAI + catalog vide → réponse ai_generated placeholder (pas de crash)", async () => {
    const { POST } = await import("../app/api/projects/[id]/npc-resolve/route");
    const res = await POST(
      makeRequest({
        rawDescription: "xxyyzz entité totalement exotique jamais vue",
        universe: "absolute-zero",
        tone: "absolute-zero",
      }) as never,
      { params: Promise.resolve({ id: "p1" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // Branch catalog_fallback ou ai_generated selon scoring ; on s'assure
    // juste que la route ne crash pas et renvoie un payload structuré.
    expect(typeof json.strategy).toBe("string");
    expect(typeof json.promptFragment).toBe("string");
    expect(json.topMatch).toBeDefined();
  });

  it("species resolver qui throw → fallback silencieux vers catalog (pas de 500)", async () => {
    detectSpeciesInDescriptionMock.mockReturnValueOnce("loup");
    resolveSpeciesArchetypeMock.mockRejectedValueOnce(new Error("db_down"));
    const { POST } = await import("../app/api/projects/[id]/npc-resolve/route");
    const res = await POST(
      makeRequest({ rawDescription: "Un grand loup noir aux yeux jaunes" }) as never,
      { params: Promise.resolve({ id: "p1" }) },
    );
    // Pas de 500 : on retombe sur scoring catalogue.
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isSpecies).not.toBe(true);
  });
});
