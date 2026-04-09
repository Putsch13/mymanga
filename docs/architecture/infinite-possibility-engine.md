# Infinite Possibility Engine

## Objectif

Créer une génération quasi infinie sans chaos en séparant clairement :

- les **contraintes dures** qui verrouillent l’univers, le ton, la continuité et les garde-fous produit
- les **contraintes souples** qui autorisent la variété visuelle et narrative
- la **génération procédurale seedée** qui rend les variations rejouables et testables

## Architecture livrée

### 1. `SceneBlueprint`

Le pipeline construit désormais un `SceneBlueprint` avant le prompt final panel.

Il contient :

- contexte narratif
- contexte style
- environnement
- cast
- composition
- contraintes
- sélections procédurales
- pont de prompt (`promptBridge`)

Ce blueprint est persisté dans la metadata panel et réinjecté dans `composeMangaPanelPrompt`.

### 2. Ontologies procédurales

Le package `@manga-ai-studio/world` expose :

- `npc-ontology.ts`
- `location-ontology.ts`
- `creature-ontology.ts`

Chaque ontology décrit :

- compatibilités d’univers / ton / style
- indices visuels
- hooks d’interaction
- rareté

La sélection est combinatoire, seedée et ensuite filtrée par le `constraint-graph`.

### 3. `constraint-graph`

Le graphe lie :

- univers
- ton
- style
- factions
- météo
- état du monde
- lieu
- candidats ontologiques

Règle :

- une incompatibilité forte avec `worldStrictness` élevé devient une **contrainte dure**
- une incompatibilité tolérable devient une **contrainte souple**

Le moteur renvoie :

- `accepted`
- `hardFailures`
- `softWarnings`
- `score`

### 4. Génération procédurale contrôlée

Le blueprint produit des sorties bornées :

- PNJ
- signaux de lieu
- créatures
- props
- traces environnementales
- variations de scène

Les contrôles créatifs disponibles sont :

- `noveltyLevel`
- `worldStrictness`
- `visualExoticism`
- `npcVariety`
- `environmentRichness`

Ils n’ouvrent la variété qu’à l’intérieur du périmètre autorisé par les contraintes dures.

### 5. QA procédurale

Deux niveaux sont fournis :

- `fixed_regression_suite`
- `procedural_stress_suite`

Le second s’appuie sur des seeds rejouables pour vérifier que la variété reste cohérente.

### 6. Validation par propriétés

Les validateurs livrés couvrent :

- présence du décor quand requis
- cohérence lieu / ton / style
- cohérence PNJ / monde
- interaction environnementale réelle
- fidélité style pack
- garde-fous lore

### 7. Tests métamorphiques

Les tests métamorphiques changent une seule variable et vérifient que :

- le noyau stable reste stable
- la variable modifiée produit bien un effet visible

Exemple livré :

- météo modifiée avec seed identique
- lieu stable
- météo effectivement différente

## Comment le système garde l’infini sans casser la cohérence

Le moteur ne génère jamais “au hasard libre”.

Il suit cette hiérarchie :

1. canon / continuité / modération
2. univers / ton / style
3. objectif de scène / composition
4. contraintes dures et souples
5. génération procédurale seedée
6. validation par propriétés

Donc :

- l’infini vient de la combinatoire contrôlée
- la cohérence vient du filtrage + scoring + validateurs
- la stabilité vient des seeds et des contraintes dures

## Intégration pipeline

Le point d’injection choisi est entre :

- `buildPanelContract`
- `composeMangaPanelPrompt`

Pourquoi :

- on garde le pipeline actuel
- on évite une refonte lourde du storyboard
- on injecte la variété au dernier moment utile
- on peut tracer exactement ce qui a été demandé à l’image

## Limites actuelles

- les ontologies sont volontairement compactes : elles ouvrent l’architecture, pas encore une encyclopédie monde complète
- le `constraint-graph` est un moteur de compatibilité robuste mais encore simple, pas un solveur CSP avancé
- les contrôles créatifs sont branchés côté moteur, pas encore exposés en UI produit
- la QA procédurale valide le blueprint et l’injection prompt, pas encore l’image générée elle-même par vision scoring

## Extension naturelle

- enrichir les ontologies par univers
- connecter les factions et props à la story bible de façon persistante
- faire remonter les contrôles créatifs en admin / debug UI
- brancher ces validateurs au reroll image final
