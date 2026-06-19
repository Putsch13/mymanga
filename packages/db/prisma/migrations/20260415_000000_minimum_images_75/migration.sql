-- Mise à jour de la cible minimum d'images : 55 → 75
ALTER TABLE "Chapter" ALTER COLUMN "minimumImages" SET DEFAULT 75;

-- Mettre à jour les chapitres existants qui sont encore à 55
UPDATE "Chapter" SET "minimumImages" = 75 WHERE "minimumImages" = 55;
