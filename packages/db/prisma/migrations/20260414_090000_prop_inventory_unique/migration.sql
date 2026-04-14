-- FIX-4 : Ajouter contrainte unique sur CharacterPropInventory
-- Évite les doublons lors des upserts de props par personnage

-- Supprimer d'abord les éventuels doublons (conserver le plus récent)
DELETE FROM "CharacterPropInventory" a
USING "CharacterPropInventory" b
WHERE a.id < b.id
  AND a."characterId" = b."characterId"
  AND a."propCanonicalName" = b."propCanonicalName";

-- Ajouter la contrainte unique
ALTER TABLE "CharacterPropInventory"
ADD CONSTRAINT "CharacterPropInventory_characterId_propCanonicalName_key"
UNIQUE ("characterId", "propCanonicalName");
