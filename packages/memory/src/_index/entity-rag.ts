/**
 * Indexation RAG par entité (character / location / npc).
 *
 * Lorsqu'un chapitre ultérieur réfère vaguement à « la forge du village » ou
 * « le garde borgne », l'embedding pointe vers la fiche canonique au lieu de
 * laisser le LLM inventer une nouvelle entrée.
 */
import type { PrismaClient } from "@manga-ai-studio/db";
import { replaceRagDocument } from "./rag-documents";

export interface CharacterRagInput {
  id: string;
  projectId: string;
  name: string;
  roleType?: string | null;
  biography?: string | null;
  appearance?: string | null;
  outfitDefault?: string | null;
  traits?: string[] | null;
  flaws?: string[] | null;
}

export async function indexCharacterForRag(
  prisma: PrismaClient,
  character: CharacterRagInput,
) {
  const parts = [
    `Nom: ${character.name}`,
    character.roleType ? `Rôle: ${character.roleType}` : null,
    character.appearance ? `Apparence: ${character.appearance}` : null,
    character.outfitDefault ? `Tenue: ${character.outfitDefault}` : null,
    character.traits?.length ? `Traits: ${character.traits.join(", ")}` : null,
    character.flaws?.length ? `Failles: ${character.flaws.join(", ")}` : null,
    character.biography ? `Bio: ${character.biography}` : null,
  ].filter(Boolean);

  return replaceRagDocument(prisma, {
    projectId: character.projectId,
    entityType: "character",
    entityId: character.id,
    title: character.name,
    content: parts.join("\n"),
    metadata: {
      characterId: character.id,
      roleType: character.roleType ?? null,
    },
  });
}

export interface LocationRagInput {
  id: string;
  projectId: string;
  name: string;
  type?: string | null;
  description?: string | null;
  visualBrief?: string | null;
  aliases?: string[] | null;
}

export async function indexLocationForRag(
  prisma: PrismaClient,
  location: LocationRagInput,
) {
  const parts = [
    `Lieu: ${location.name}`,
    location.type ? `Type: ${location.type}` : null,
    location.aliases?.length ? `Alias: ${location.aliases.join(", ")}` : null,
    location.visualBrief ? `Visuel: ${location.visualBrief}` : null,
    location.description ? `Description: ${location.description}` : null,
  ].filter(Boolean);

  return replaceRagDocument(prisma, {
    projectId: location.projectId,
    entityType: "location",
    entityId: location.id,
    title: location.name,
    content: parts.join("\n"),
    metadata: { locationId: location.id, type: location.type ?? null },
  });
}

export interface NpcRagInput {
  id: string;
  projectId: string;
  displayName: string;
  role?: string | null;
  description?: string | null;
  outfitSignature?: string | null;
  silhouetteSignature?: string | null;
  locationKey?: string | null;
}

export async function indexNpcForRag(prisma: PrismaClient, npc: NpcRagInput) {
  const parts = [
    `PNJ: ${npc.displayName}`,
    npc.role ? `Rôle: ${npc.role}` : null,
    npc.locationKey ? `Lieu récurrent: ${npc.locationKey}` : null,
    npc.silhouetteSignature ? `Silhouette: ${npc.silhouetteSignature}` : null,
    npc.outfitSignature ? `Tenue: ${npc.outfitSignature}` : null,
    npc.description ? `Description: ${npc.description}` : null,
  ].filter(Boolean);

  return replaceRagDocument(prisma, {
    projectId: npc.projectId,
    entityType: "npc",
    entityId: npc.id,
    title: npc.displayName,
    content: parts.join("\n"),
    metadata: {
      npcId: npc.id,
      role: npc.role ?? null,
      locationKey: npc.locationKey ?? null,
    },
  });
}
