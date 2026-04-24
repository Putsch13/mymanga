# Scripts Prisma manuels

Ce document décrit les scripts manuels de maintenance de la base de données.

## Vue d'ensemble

| Script | Objectif | Idempotent |
|--------|----------|------------|
| `seed.ts` | Données de test initiales | Oui |
| `backfill-chapter-studio.ts` | Migration des chapitres vers le format studio | Oui |
| `backfill-chapter-runtime-structured.ts` | Migration vers le runtime structuré | Oui |
| `backfill-hard-switch.ts` | Bascule hard vers V3 premium | Non |
| `run-legacy-prechecks.ts` | Vérifications avant bascule legacy | Oui |
| `run-hard-switch-postchecks.ts` | Vérifications après bascule V3 | Oui |
| `cleanup-orphan-autogen-characters.ts` | Nettoyage PNJ orphelins | Oui |

---

## Détails par script

### seed.ts

**Objectif** : Créer les données de test initiales pour le développement.

**Quand le lancer** : 
- Après un reset de la base de données
- Pour initialiser un environnement de développement

**Environnement requis** : `DATABASE_URL` configurée

**Commande** :
```bash
pnpm --filter @manga-ai-studio/db exec tsx prisma/seed.ts
```

**Idempotent** : Oui (utilise upsert)

**Risques** : Aucun en développement. Ne pas exécuter en production.

---

### backfill-chapter-studio.ts

**Objectif** : Migrer les chapitres existants vers le nouveau format studio.

**Quand le lancer** : 
- Après déploiement d'une nouvelle version du studio
- Une seule fois par environnement

**Environnement requis** : `DATABASE_URL` configurée

**Commande** :
```bash
pnpm --filter @manga-ai-studio/db exec tsx prisma/backfill-chapter-studio.ts
```

**Idempotent** : Oui (vérifie si déjà migré)

**Risques** : Faible. Met à jour le champ `outline` des chapitres.

---

### backfill-chapter-runtime-structured.ts

**Objectif** : Migrer vers le format runtime structuré (champs DB au lieu de JSON).

**Quand le lancer** : 
- Après ajout des nouveaux champs au schéma Prisma
- Une seule fois par environnement

**Environnement requis** : `DATABASE_URL` configurée

**Commande** :
```bash
pnpm --filter @manga-ai-studio/db exec tsx prisma/backfill-chapter-runtime-structured.ts
```

**Idempotent** : Oui

**Risques** : Faible. Lecture seule sauf pour les champs structurés.

---

### backfill-hard-switch.ts

**Objectif** : Bascule définitive vers le pipeline V3 premium.

**Quand le lancer** : 
- UNIQUEMENT après validation complète du pipeline V3
- Après `run-legacy-prechecks.ts` sans erreur

**Environnement requis** : 
- `DATABASE_URL` configurée
- `PIPELINE_V3_PREMIUM_ONLY=true`

**Commande** :
```bash
pnpm --filter @manga-ai-studio/db exec tsx prisma/backfill-hard-switch.ts
```

**Idempotent** : NON — Marque les chapitres comme "V3 only"

**Risques** : ÉLEVÉ. Désactive définitivement le legacy pour les chapitres traités.

---

### run-legacy-prechecks.ts

**Objectif** : Vérifier que les conditions sont réunies pour la bascule legacy.

**Quand le lancer** : 
- Avant `backfill-hard-switch.ts`
- Pour auditer l'état des chapitres

**Environnement requis** : `DATABASE_URL` configurée

**Commande** :
```bash
pnpm --filter @manga-ai-studio/db exec tsx prisma/run-legacy-prechecks.ts
```

**Idempotent** : Oui (lecture seule)

**Risques** : Aucun (lecture seule)

---

### run-hard-switch-postchecks.ts

**Objectif** : Vérifier que la bascule V3 s'est bien passée.

**Quand le lancer** : 
- Après `backfill-hard-switch.ts`
- Pour valider l'état final

**Environnement requis** : `DATABASE_URL` configurée

**Commande** :
```bash
pnpm --filter @manga-ai-studio/db exec tsx prisma/run-hard-switch-postchecks.ts
```

**Idempotent** : Oui (lecture seule)

**Risques** : Aucun (lecture seule)

---

### cleanup-orphan-autogen-characters.ts

**Objectif** : Supprimer les PNJ auto-générés orphelins (sans chapitre parent).

**Quand le lancer** : 
- Périodiquement (maintenance)
- Après suppression massive de chapitres

**Environnement requis** : `DATABASE_URL` configurée

**Commande** :
```bash
pnpm --filter @manga-ai-studio/db exec tsx prisma/cleanup-orphan-autogen-characters.ts
```

**Idempotent** : Oui

**Risques** : Modéré. Supprime des données (mais uniquement des orphelins).

---

## Bonnes pratiques

1. **Toujours** faire un backup avant les scripts non-idempotents
2. **Toujours** exécuter `run-legacy-prechecks.ts` avant `backfill-hard-switch.ts`
3. **Ne jamais** exécuter `seed.ts` en production
4. **Vérifier** les logs après chaque exécution
5. **Documenter** toute modification de ces scripts
