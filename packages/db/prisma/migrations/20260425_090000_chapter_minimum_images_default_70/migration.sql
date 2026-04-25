-- Alignement du defaut DB sur PRODUCTION_RULES.panelCount.minimum (70).
-- Les chapitres existants conservent leur valeur (ex. 75) ; seuls les nouveaux
-- enregistrements sans valeur explicite heritent du defaut 70.
ALTER TABLE "Chapter" ALTER COLUMN "minimumImages" SET DEFAULT 70;
