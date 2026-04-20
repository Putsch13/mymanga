import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonBody } from "../lib/parse-json-body";

/**
 * P1.4 — parseJsonBody unifie body parsing + Zod validation avec
 * 400 (malformed) / 422 (invalid) deterministes.
 */

const schema = z.object({ name: z.string().min(1), age: z.number().int().min(0) });

function makeRequest(body: string, contentType = "application/json"): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    body,
    headers: { "content-type": contentType },
  });
}

describe("parseJsonBody (P1.4)", () => {
  it("retourne ok=true avec la data pour un body valide", async () => {
    const req = makeRequest(JSON.stringify({ name: "Ada", age: 30 }));
    const parsed = await parseJsonBody(req, schema);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data).toEqual({ name: "Ada", age: 30 });
    }
  });

  it("retourne 400 bad_request si le JSON est malforme", async () => {
    const req = makeRequest("not json at all");
    const parsed = await parseJsonBody(req, schema);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.response.status).toBe(400);
      const payload = await parsed.response.json();
      expect(payload.error).toBe("bad_request");
    }
  });

  it("retourne 422 validation_error avec fieldErrors si le schema rejette", async () => {
    const req = makeRequest(JSON.stringify({ name: "", age: -1 }));
    const parsed = await parseJsonBody(req, schema);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.response.status).toBe(422);
      const payload = await parsed.response.json();
      expect(payload.error).toBe("validation_error");
      expect(payload.details?.fieldErrors?.name).toBeDefined();
      expect(payload.details?.fieldErrors?.age).toBeDefined();
    }
  });

  it("retourne 400 quand le body est vide par defaut", async () => {
    const req = makeRequest("");
    const parsed = await parseJsonBody(req, schema);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.response.status).toBe(400);
    }
  });

  it("autorise le body vide si allowEmptyBody=true", async () => {
    const emptyObjSchema = z.object({}).strict();
    const req = makeRequest("");
    const parsed = await parseJsonBody(req, emptyObjSchema, { allowEmptyBody: true });
    expect(parsed.ok).toBe(true);
  });

  it("utilise les messages custom fournis", async () => {
    const req = makeRequest("oops");
    const parsed = await parseJsonBody(req, schema, {
      malformedMessage: "Mon message custom.",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      const payload = await parsed.response.json();
      expect(payload.message).toBe("Mon message custom.");
    }
  });
});
