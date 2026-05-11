/**
 * Vue de lecture du contrat visuel d'un chapitre (snapshot
 * `chapter.outline.chapterVisualContract` produit par le pipeline premium).
 *
 * Sert de référence visuelle (lieu principal, espèces, robots, props
 * obligatoires…) pour aider l'utilisateur à voir ce que l'IA va imposer
 * comme couverture visuelle.
 */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VisualContractEntry {
  name?: unknown;
  reason?: unknown;
  importance?: unknown;
}

export function ChapterVisualContractReadout({ snapshot }: { snapshot: unknown }) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const o = snapshot as Record<string, unknown>;
  const contract =
    o.contract && typeof o.contract === "object" && !Array.isArray(o.contract)
      ? (o.contract as Record<string, unknown>)
      : null;
  if (!contract) return null;

  const main =
    contract.mainLocation && typeof contract.mainLocation === "object"
      ? (contract.mainLocation as Record<string, unknown>)
      : null;
  const mainName = typeof main?.name === "string" && main.name.trim() ? main.name : null;
  const needsClarification = contract.needsClarification === true;
  const usedOpenAI = o.usedOpenAI === true;
  const requiredCount =
    typeof o.requiredFromContractCount === "number" ? o.requiredFromContractCount : 0;
  const warnings = Array.isArray(o.warnings) ? (o.warnings as string[]) : [];
  const props = Array.isArray(contract.props) ? (contract.props as VisualContractEntry[]) : [];
  const species = Array.isArray(contract.species) ? (contract.species as VisualContractEntry[]) : [];
  const robots = Array.isArray(contract.robots) ? (contract.robots as VisualContractEntry[]) : [];
  const hybrids = Array.isArray(contract.hybrids) ? (contract.hybrids as VisualContractEntry[]) : [];
  const creatures = Array.isArray(contract.creatures)
    ? (contract.creatures as VisualContractEntry[])
    : [];
  const rejected = Array.isArray(contract.rejectedOrUnrelated)
    ? (contract.rejectedOrUnrelated as VisualContractEntry[])
    : [];

  const requiredProps = props.filter((p) => p.importance === "required");
  const optionalProps = props.filter((p) => p.importance !== "required");

  return (
    <Card className="border-border/60 bg-card/30">
      <CardHeader>
        <CardTitle className="text-base">Contrat visuel du chapitre</CardTitle>
        <p className="text-xs text-muted-foreground">
          Extrait lors du pipeline premium (IA locale au chapitre). Sert de référence pour la
          couverture visuelle.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Source IA : {usedOpenAI ? "oui" : "non"}</span>
          <span>Obligations « required » : {requiredCount}</span>
        </div>
        {needsClarification ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
            Lieu principal encore ambigu — précise le décor dans l’intent ou les beats si besoin.
          </p>
        ) : null}
        <div>
          <p className="text-xs font-medium text-muted-foreground">Lieu principal détecté</p>
          <p className="mt-0.5">{mainName ?? "— (non spécifié)"}</p>
        </div>

        <BulletGroup label="Espèces / peuples" entries={species} take={6} />
        <BulletGroup label="Robots / méchas" entries={robots} take={6} />
        <BulletGroup label="Hybrides / chimères" entries={hybrids} take={6} />
        <BulletGroup label="Créatures / menaces (autres)" entries={creatures} take={8} />
        <BulletGroup label="Props obligatoires (contrat)" entries={requiredProps} take={requiredProps.length} />

        {optionalProps.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Props optionnels / ambiance</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {optionalProps
                .slice(0, 12)
                .map((p) => (typeof p.name === "string" ? p.name : ""))
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
          </div>
        ) : null}

        {rejected.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-amber-600/90">Entités écartées (hors chapitre)</p>
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {rejected.slice(0, 6).map((r, i) => (
                <li key={i}>
                  <span className="font-medium">{typeof r.name === "string" ? r.name : "?"}</span>
                  {typeof r.reason === "string" ? ` — ${r.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Avertissements : {warnings.slice(0, 3).join(" · ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BulletGroup({
  label,
  entries,
  take,
}: {
  label: string;
  entries: VisualContractEntry[];
  take: number;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="mt-1 list-inside list-disc text-muted-foreground">
        {entries.slice(0, take).map((c, i) => (
          <li key={i}>{typeof c.name === "string" ? c.name : "—"}</li>
        ))}
      </ul>
    </div>
  );
}
