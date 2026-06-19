# `apps/web/features/`

Code **UI** organisé par feature produit (wizard, reader, studio editor…).

## Convention

```
features/
  studio/
    wizard/        # composants + hooks du Wizard chapitre (P0.4 → P0.10)
    editor/        # studio editor existant (à migrer depuis components/studio)
    readiness/     # premium readiness UI (à migrer depuis components/studio)
  reader/
    panel/         # composants reader + édition panel (P4.1)
  manga/
    library/       # listing manga
    project/       # paramétrage projet
```

## Migration progressive (P2.2)

Les composants legacy vivent encore sous `apps/web/components/`. Migration ticket
par ticket : on déplace un composant, on met à jour ses imports, et on supprime
l’ancien chemin **dans le même PR**.

Aucun import inverse `features/ → components/` n’est toléré sur les nouveaux fichiers.
