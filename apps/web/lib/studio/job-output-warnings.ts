/**
 * Avertissements pipeline / job — affichage studio (README : plus seulement les logs serveur).
 */

function pushUnique(out: string[], seen: Set<string>, line: string) {
  const s = line.trim();
  if (!s || seen.has(s)) return;
  seen.add(s);
  out.push(s);
}

/**
 * Agrège les messages utilisateur à partir de `Job.output` (Prisma JSON).
 */
export function extractJobPipelineUserWarnings(output: unknown): string[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) return [];
  const o = output as Record<string, unknown>;
  const seen = new Set<string>();
  const out: string[] = [];

  if (Array.isArray(o.pipelineUserWarnings)) {
    for (const w of o.pipelineUserWarnings) {
      if (typeof w === "string") pushUnique(out, seen, w);
    }
  }

  if (Array.isArray(o.degradedModes)) {
    for (const w of o.degradedModes) {
      if (typeof w === "string" && w.trim()) pushUnique(out, seen, `Mode dégradé — ${w.trim()}`);
    }
  }

  if (Array.isArray(o.warnings)) {
    for (const w of o.warnings) {
      if (typeof w === "string") pushUnique(out, seen, w);
    }
  }

  const cont = o.continuityWarnings;
  if (cont && typeof cont === "object" && !Array.isArray(cont)) {
    const m = (cont as Record<string, unknown>).missingStableName;
    if (Array.isArray(m)) {
      for (const id of m) {
        if (typeof id === "string" && id.trim()) {
          pushUnique(out, seen, `État personnage (réf. stable) — ${id.trim()}`);
        }
      }
    }
  }

  const diag = o.generationDiagnostics;
  if (diag && typeof diag === "object" && !Array.isArray(diag)) {
    const d = diag as Record<string, unknown>;
    const dialogue = d.dialogue;
    if (dialogue && typeof dialogue === "object" && !Array.isArray(dialogue)) {
      const fb = (dialogue as Record<string, unknown>).fallbackSceneIds;
      if (Array.isArray(fb) && fb.length > 0) {
        const ids = fb.filter((x): x is string => typeof x === "string").slice(0, 8).join(", ");
        if (ids) pushUnique(out, seen, `Dialogue en mode dégradé sur scènes : ${ids}`);
      }
    }
  }

  return out;
}
