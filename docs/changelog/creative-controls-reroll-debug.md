# Creative Controls + Reroll + Debug

## Livré

- exposition UI des contrôles `noveltyLevel`, `worldStrictness`, `visualExoticism`, `npcVariety`, `environmentRichness` sur la page de génération chapitre
- propagation de ces contrôles dans le draft setup, le job input et le pipeline panel
- enrichissement des ontologies PNJ / lieux / créatures pour élargir l’espace combinatoire
- scoring premium panel dans `panel-validator` :
  - `backgroundPresenceScore`
  - `environmentReadabilityScore`
  - `interactionScore`
  - `shotComplianceScore`
  - `styleConsistencyScore`
  - `releaseScore`
- branchement de ces scores au reroll final des panels
- exposition debug dans le reader : contrôles moteur, score release, score décor, score interaction, score style, rerolls, issues

## QA

- tests AI mis à jour avec `panel-validator.test.ts`
- tests `@manga-ai-studio/ai` et `@manga-ai-studio/world` passants
- build `@manga-ai-studio/web` validé

## Limites restantes

- la validation reste heuristique tant qu’il n’y a pas de vision model sur l’image réellement générée
- les contrôles créatifs sont exposés dans l’UI de génération chapitre, pas encore dans une page d’admin dédiée ou persistés comme entité Prisma propre
