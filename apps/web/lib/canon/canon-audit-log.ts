/**
 * P4.4 — Audit trail minimum sur les changements canoniques.
 *
 * Jusqu'à ce qu'une table `canon_audit_log` soit ajoutée au schema Prisma,
 * on log en JSON structuré (stdout → Render/Vercel logs) pour pouvoir
 * reconstituer l'historique par grep. Le format est stable et versionné
 * pour permettre une future ingestion dans une vraie table.
 *
 * Événements tracés :
 *   - `character_canon_changed`  — PATCH character modifiant un champ canon
 *   - `visual_ref_promoted`      — `isPrimary: false → true`
 *   - `visual_ref_demoted`       — `isPrimary: true → false` ou archivedAt
 *   - `visual_lock_created`      — nouveau CharacterVisualLock actif
 *   - `location_canon_changed`   — update location metadata/canonImageUrl
 */

type AuditEvent =
  | {
      kind: "character_canon_changed";
      characterId: string;
      userId: string;
      changedKeys: string[];
      requiresApproval?: string[];
    }
  | {
      kind: "visual_ref_promoted";
      characterId: string;
      visualRefId: string;
      userId: string;
      previousPrimaryId?: string | null;
    }
  | {
      kind: "visual_ref_demoted";
      characterId: string;
      visualRefId: string;
      userId: string;
      reason: string;
    }
  | {
      kind: "visual_lock_created";
      characterId: string;
      visualLockId: string;
      userId: string;
      source: "generate-visual" | "manual" | "lora-training";
      version: number;
    }
  | {
      kind: "location_canon_changed";
      locationId: string;
      userId: string;
      changedKeys: string[];
    };

export function logCanonAudit(event: AuditEvent): void {
  const payload = {
    schema: "canon.audit.v1",
    ts: new Date().toISOString(),
    ...event,
  };
  try {
    console.log(`[canon:audit] ${JSON.stringify(payload)}`);
  } catch {
    console.log(`[canon:audit] kind=${event.kind}`);
  }
}
