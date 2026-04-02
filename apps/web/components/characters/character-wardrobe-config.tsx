"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WardrobeProfile {
  defaultOutfit?: string;
  combatOutfit?: string;
  casualOutfit?: string;
  formalOutfit?: string;
  sleepwear?: string;
  armor?: string;
  accessoriesFixed?: string[];
  colorPalette?: string[];
  fabricStyle?: string;
  exposureLevel?: string;
  silhouetteIntent?: string;
}

interface Props {
  value: WardrobeProfile;
  onChange: (v: WardrobeProfile) => void;
  isAdult?: boolean;
}

export function CharacterWardrobeConfig({ value, onChange, isAdult = false }: Props) {
  const set = (key: keyof WardrobeProfile) => (v: unknown) => onChange({ ...value, [key]: v });

  const exposureLevels = isAdult
    ? ["covered", "fitted", "revealing", "provocative_adult"]
    : ["covered", "fitted", "revealing"];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Garde-robe & Style
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Tenue principale</Label>
          <Input value={value.defaultOutfit ?? ""} onChange={(e) => set("defaultOutfit")(e.target.value)} placeholder="Manteau noir, chemise blanche..." />
        </div>
        <div className="space-y-1.5">
          <Label>Tenue combat</Label>
          <Input value={value.combatOutfit ?? ""} onChange={(e) => set("combatOutfit")(e.target.value)} placeholder="Armure légère, tenue tactique..." />
        </div>
        <div className="space-y-1.5">
          <Label>Tenue décontractée</Label>
          <Input value={value.casualOutfit ?? ""} onChange={(e) => set("casualOutfit")(e.target.value)} placeholder="Jean, t-shirt, baskets..." />
        </div>
        <div className="space-y-1.5">
          <Label>Tenue formelle</Label>
          <Input value={value.formalOutfit ?? ""} onChange={(e) => set("formalOutfit")(e.target.value)} placeholder="Costume sombre, robe élégante..." />
        </div>
        <div className="space-y-1.5">
          <Label>Style tissu</Label>
          <Select value={value.fabricStyle ?? ""} onValueChange={set("fabricStyle")}>
            <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
            <SelectContent>
              {["Cuir", "Soie", "Lin", "Coton", "Synthétique", "Armure", "Tissu traditionnel"].map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Niveau d&apos;exposition visuelle</Label>
          <Select value={value.exposureLevel ?? "covered"} onValueChange={set("exposureLevel")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {exposureLevels.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isAdult && (
            <p className="text-xs text-muted-foreground">
              &quot;provocative_adult&quot; disponible uniquement pour les personnages 18+ vérifiés.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Accessoires fixes</Label>
          <Input
            value={(value.accessoriesFixed ?? []).join(", ")}
            onChange={(e) => set("accessoriesFixed")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="Montre, bague, épée..."
          />
        </div>
        <div className="space-y-1.5">
          <Label>Palette de couleurs</Label>
          <Input
            value={(value.colorPalette ?? []).join(", ")}
            onChange={(e) => set("colorPalette")(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="Noir, rouge sang, or..."
          />
        </div>
      </div>
    </div>
  );
}
