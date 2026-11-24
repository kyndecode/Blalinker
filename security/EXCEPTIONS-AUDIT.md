# Exceptions au contrôle de sécurité des dépendances

Le pipeline (job « Audit sécurité ») exécute `scripts/audit-gate.mjs` pour chaque
application. Ce script bloque **toute** vulnérabilité `high` ou `critical` des
dépendances de production, sauf celles listées une par une dans
[`audit-allowlist.json`](audit-allowlist.json) :

- l'exception porte sur **un identifiant GHSA précis**, **un paquet** et **des projets nommés** ;
- elle a une **date d'expiration** : passée cette date, le pipeline échoue de nouveau ;
- une nouvelle vulnérabilité `high`/`critical`, même sur le même paquet, **n'est pas couverte** ;
- les vulnérabilités `moderate`/`low` restent affichées dans le journal du pipeline.

Aucun contrôle n'est désactivé globalement.

## GHSA-mrhx-c7xc-m3w5 — zod < 4.6.6 (high)

| | |
|---|---|
| Alerte | « Zod can exhaust memory while validating oversized constrained collections » — https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 |
| Projets | backend, frontend-web, frontend-admin (zod 3.25.76) |
| Correctif | zod ≥ 4.6.6 uniquement : changement de version majeure |
| Ajoutée | 2026-11-24 |
| Expire | **2027-01-31** |
| Tâche de suppression | [TACHE-ZOD4-MIGRATION.md](TACHE-ZOD4-MIGRATION.md) |

### Risque

Déni de service : une requête contenant une très grande collection (tableau,
ensemble…) peut faire consommer beaucoup de mémoire pendant la validation et
ralentir ou arrêter le serveur. Pas de fuite de données ni d'exécution de code.

- **Backend** (exposé à Internet) : risque réel, réduit par la mesure ci-dessous.
- **Site public et administration** : zod n'y valide que les formulaires saisis par
  l'utilisateur dans son propre navigateur ; un attaquant ne peut affecter que sa
  propre page. Risque négligeable.

### Mesure compensatoire en place

- Corps JSON et formulaires limités à **1 Mo** par requête (`backend/src/app.ts`,
  auparavant 10 Mo), ce qui borne la taille des collections validées.
- Limitation de débit existante : 200 requêtes / 15 min par IP (API), 15 pour `/auth`,
  60 / min pour `/admin`.

### Ce qui lève l'exception

La migration vers zod 4 (lot 3) puis la suppression de l'entrée dans
`audit-allowlist.json`. Le pipeline signale « à retirer » une exception devenue inutile.
