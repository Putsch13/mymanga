"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@manga-ai-studio/ui";

interface CharacterPreviewCardProps {
  name: string;
  roleType?: string | null;
  age?: number | null;
  adultVerified?: boolean;
  appearance?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  outfitDefault?: string | null;
  bodyState?: Record<string, unknown>;
  imageUrl?: string | null;
  className?: string;
}

export function CharacterPreviewCard({
  name,
  roleType,
  age,
  adultVerified,
  appearance,
  hairColor,
  eyeColor,
  outfitDefault,
  bodyState,
  imageUrl,
  className,
}: CharacterPreviewCardProps) {
  const bs = bodyState ?? {};
  const missingParts: string[] = [];
  if (bs.leftArmPresent === false) missingParts.push("Bras gauche manquant");
  if (bs.rightArmPresent === false) missingParts.push("Bras droit manquant");
  if (bs.leftEyePresent === false) missingParts.push("Œil gauche manquant");
  if (bs.rightEyePresent === false) missingParts.push("Œil droit manquant");
  const scars = (bs.scarsCurrent as string[] | undefined) ?? [];
  const prosthetics = (bs.prosthetics as string[] | undefined) ?? [];

  return (
    <div className={cn("rounded-xl border border-border/60 bg-card/80 p-4 space-y-3", className)}>
      {/* Avatar / image */}
      <div className="flex items-start gap-4">
        <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-muted/40">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground/40">
              👤
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg leading-tight truncate">{name}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {roleType && (
              <Badge variant="outline" className="text-xs">
                {roleType}
              </Badge>
            )}
            {age && (
              <Badge variant="outline" className="text-xs">
                {age} ans
              </Badge>
            )}
            {adultVerified && (
              <Badge className="text-xs bg-rose-900/40 text-rose-300 border-rose-700/40">
                18+
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Apparence */}
      {(appearance || hairColor || eyeColor) && (
        <div className="space-y-1">
          {appearance && <p className="text-sm text-muted-foreground line-clamp-2">{appearance}</p>}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {hairColor && <span>Cheveux : {hairColor}</span>}
            {eyeColor && <span>Yeux : {eyeColor}</span>}
          </div>
        </div>
      )}

      {/* Tenue */}
      {outfitDefault && (
        <p className="text-xs text-muted-foreground/70 line-clamp-1">
          Tenue : {outfitDefault}
        </p>
      )}

      {/* État physique */}
      {(missingParts.length > 0 || scars.length > 0 || prosthetics.length > 0) && (
        <div className="space-y-1 pt-1 border-t border-border/40">
          {missingParts.map((p) => (
            <Badge key={p} variant="outline" className="text-xs border-red-700/40 text-red-400 mr-1">
              {p}
            </Badge>
          ))}
          {scars.map((s) => (
            <Badge key={s} variant="outline" className="text-xs border-amber-700/40 text-amber-400 mr-1">
              Cicatrice: {s}
            </Badge>
          ))}
          {prosthetics.map((p) => (
            <Badge key={p} variant="outline" className="text-xs border-cyan-700/40 text-cyan-400 mr-1">
              Prothèse: {p}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
