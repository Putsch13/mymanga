# Premium UI Priority Plan

## Règle
Ne rien implémenter avant validation de la migration reviewable et du runbook backfill.

## Priorité 1 — Chapter Studio
Objectif: cockpit principal de pilotage chapitre/scène/panel.

### Layout
- gauche: liste des scènes, statut, keyframe active, personnages présents, intensité, score scène
- centre: grille pages/panels avec grandes miniatures, badges `validated`, `drift`, `rerolled`, `combat`, `weak_background`, `missing_subject`
- droite: cockpit du panel sélectionné

### Cockpit panel
- identité: personnages attendus/détectés, lock utilisé, drift oui/non
- génération: modèle, mode, keyframe source, refs, LoRAs, prompt positif, prompt négatif
- qualité: score global, background continuity, face consistency, style continuity, fight readability, warnings
- actions: reroll identité, décor, action, style, comparaison tentative précédente, promotion canon

## Priorité 2 — Character Lock Studio
Objectif: rendre la persistance visuelle explicitement contrôlable.

### Vues
- lock actif
- refs sources
- LoRA active
- versions
- comparaison avant/après

### Actions
- activer une version
- cloner une version
- comparer deux versions
- régénérer un pack canon
- utiliser pour le prochain chapitre

## Priorité 3 — Scene Keyframe Studio
Objectif: visualiser qu'un chapitre dérive d'ancrages de scène forts.

### Vues
- keyframe active
- variantes refusées
- panels dérivés
- personnages présents
- décor lock
- lumière lock
- composition archetype

## Priorité 4 — FAL Trace Explorer
Objectif: expliquer en moins de 10 secondes pourquoi une image est ratée.

### Vues
- timeline des jobs
- filtres chapitre/scène/panel/personnage
- cartes lisibles
- miniatures input/output
- payloads expandables
- erreurs
- timings
- diff entre rerolls

## Priorité 5 — Combat Controls
Objectif: sortir la génération de combat du mode heuristique.

### Contrôles
- preset de beat
- lisibilité d'action
- intensité
- destruction décor
- blood/stylization level
- caméra

### Presets
- `fast_exchange`
- `heavy_strike`
- `brutal_finisher`
- `crowd_shock`
- `post_impact_silence`

## Principes UX
- dark mode profond
- peu de bordures
- surfaces nettes
- grosses miniatures
- hiérarchie lisible
- badges sobres
- animations minimales
- une couleur d'accent contrôlée

## Pré-requis avant implémentation
- migration appliquée
- backfill validé en dry-run puis réel
- post-checks verts
- traces FAL exploitables
- score qualité consolidé par panel/scène/chapitre

## Plans d'exécution détaillés
- `docs/chapter-studio-implementation-plan.md`
- `docs/character-lock-studio-implementation-plan.md`
- `docs/fal-trace-explorer-implementation-plan.md`

## Ordre d'implémentation recommandé
1. Chapter Studio
2. Character Lock Studio
3. FAL Trace Explorer
4. Scene Keyframe Studio
5. Combat Controls
