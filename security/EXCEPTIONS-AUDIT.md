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

## Exceptions en vigueur

Aucune (au 2026-11-25).

## Historique

### GHSA-mrhx-c7xc-m3w5 — zod < 4.6.6 (high) — CLOSE le 2026-11-25

- Exception ouverte le 2026-11-24 (expiration prévue 2027-01-31), limitée à ce seul
  identifiant, pour backend, frontend-web et frontend-admin (zod 3.25.76).
- Mesure compensatoire pendant l'exception : corps JSON limités à 1 Mo (conservée).
- Correction : zod 4.6.7 dans les trois applications, @hookform/resolvers 5.9.2
  (compatible zod 4) ; voir [TACHE-ZOD4-MIGRATION.md](TACHE-ZOD4-MIGRATION.md).
- Exception retirée de `audit-allowlist.json` ; `npm audit --omit=dev` : 0 vulnérabilité
  dans les trois applications (react-router 7.18.5 et i18next 26.7.2 corrigent aussi les
  alertes modérées restantes).
