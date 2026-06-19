/**
 * P3.2 — Test de non-régression : la migration
 * `20260419_200000_p32_provenance_storage_constraints` doit contenir tous les
 * CHECK constraints critiques.
 *
 * Ce test ne joue PAS la migration — il vérifie statiquement que le SQL
 * contient les invariants attendus, pour éviter qu'une édition ultérieure de
 * la migration (ex: "drop constraint X pour débloquer un backfill") ne la
 * vide silencieusement.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("P3.2 — migration provenance/storageProvider : invariants", () => {
  const sqlPath = resolve(
    __dirname,
    "../../../packages/db/prisma/migrations/20260419_200000_p32_provenance_storage_constraints/migration.sql",
  );
  const sql = readFileSync(sqlPath, "utf8");

  it("MediaAsset.storageProvider : CHECK enum présent", () => {
    expect(sql).toMatch(/MediaAsset_storageProvider_check/);
    expect(sql).toMatch(/'supabase'/);
    expect(sql).toMatch(/'fal'/);
    expect(sql).toMatch(/'external'/);
    expect(sql).toMatch(/'other'/);
  });

  it("MediaAsset : storageProvider='supabase' ⇒ storageKey NOT NULL", () => {
    expect(sql).toMatch(/MediaAsset_supabase_requires_storage_key/);
    expect(sql).toMatch(/"storageProvider"\s*<>\s*'supabase'\s*OR\s*"storageKey"\s*IS\s*NOT\s*NULL/);
  });

  it("CharacterVisualRef : provenance manuelle traçable", () => {
    expect(sql).toMatch(/CharacterVisualRef_manual_provenance_check/);
    expect(sql).toMatch(/'manual_import'/);
    expect(sql).toMatch(/'isCanonical'/);
  });

  it("CharacterVisualRef : unique primary ref active par character", () => {
    expect(sql).toMatch(/CharacterVisualRef_characterId_primary_active_uniq/);
    expect(sql).toMatch(/"isPrimary"\s*=\s*true/);
    expect(sql).toMatch(/"archivedAt"\s*IS\s*NULL/);
  });

  it("exige un cleanup explicite via DROP IF EXISTS avant CREATE", () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS "MediaAsset_storageProvider_check"/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS "MediaAsset_supabase_requires_storage_key"/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS "CharacterVisualRef_manual_provenance_check"/);
    expect(sql).toMatch(/DROP INDEX IF EXISTS "CharacterVisualRef_characterId_primary_active_uniq"/);
  });
});
