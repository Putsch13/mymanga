"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Globe2, Loader2, MapPin, Package, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NpcGroupCard } from "./_components/npc-group-card";
import { WorldPropCard } from "./_components/world-prop-card";
import { LocationCard } from "./_components/location-card";
import type { NpcGroup, ProjectLocation, WorldProp } from "./_components/world-types";

export default function WorldPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [npcGroups, setNpcGroups] = useState<NpcGroup[]>([]);
  const [worldProps, setWorldProps] = useState<WorldProp[]>([]);
  const [locations, setLocations] = useState<ProjectLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [gRes, pRes, lRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/world/npc-groups`),
          fetch(`/api/projects/${projectId}/world/props`),
          fetch(`/api/projects/${projectId}/locations`),
        ]);
        if (!gRes.ok || !pRes.ok || !lRes.ok) throw new Error("Échec du chargement.");
        const gData = (await gRes.json()) as { npcGroups: NpcGroup[] };
        const pData = (await pRes.json()) as { worldProps: WorldProp[] };
        const lData = (await lRes.json()) as { locations: ProjectLocation[] };
        if (!cancelled) {
          setNpcGroups(gData.npcGroups);
          setWorldProps(pData.worldProps);
          setLocations(lData.locations);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl space-y-8 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Globe2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Monde vivant</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tous les groupes de PNJ et accessoires détectés automatiquement par l&apos;IA
          depuis l&apos;intention de chaque chapitre. Édite-les pour les figer&nbsp;: une fois
          marqués <Badge variant="outline">édité</Badge>, le pipeline IA ne les écrasera
          jamais (USER-WINS).
        </p>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Groupes de PNJ</h2>
          <Badge variant="secondary">{npcGroups.length}</Badge>
        </div>
        {npcGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun groupe pour l&apos;instant. Lance une analyse d&apos;intention sur un chapitre
            pour qu&apos;ils apparaissent.
          </p>
        ) : (
          <div className="grid gap-4">
            {npcGroups.map((g) => (
              <NpcGroupCard
                key={g.id}
                group={g}
                projectId={projectId}
                onUpdated={(updated) =>
                  setNpcGroups((cur) => cur.map((x) => (x.id === updated.id ? updated : x)))
                }
                onDeleted={(id) => setNpcGroups((cur) => cur.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Lieux du monde</h2>
          <Badge variant="secondary">{locations.length}</Badge>
        </div>
        {locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun lieu pour l&apos;instant. Lance la composition d&apos;un chapitre, l&apos;IA en
            extraira automatiquement.
          </p>
        ) : (
          <div className="grid gap-4">
            {locations.map((l) => (
              <LocationCard
                key={l.id}
                location={l}
                projectId={projectId}
                onUpdated={(updated) =>
                  setLocations((cur) => cur.map((x) => (x.id === updated.id ? updated : x)))
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Accessoires &amp; artefacts</h2>
          <Badge variant="secondary">{worldProps.length}</Badge>
        </div>
        {worldProps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun accessoire pour l&apos;instant. L&apos;IA les extraira de tes intentions de
            chapitre.
          </p>
        ) : (
          <div className="grid gap-4">
            {worldProps.map((p) => (
              <WorldPropCard
                key={p.id}
                prop={p}
                projectId={projectId}
                onUpdated={(updated) =>
                  setWorldProps((cur) => cur.map((x) => (x.id === updated.id ? updated : x)))
                }
                onDeleted={(id) => setWorldProps((cur) => cur.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
