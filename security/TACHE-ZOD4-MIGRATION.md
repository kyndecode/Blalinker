# Tâche — Migration vers zod 4

**Statut :** TERMINÉE le 2026-11-25 (lot 3) · **Échéance :** avant le 2027-01-31,
date d'expiration de l'exception GHSA-mrhx-c7xc-m3w5 (voir [EXCEPTIONS-AUDIT.md](EXCEPTIONS-AUDIT.md)).

## Objectif

Passer `zod` de 3.25.x à ≥ 4.6.6 dans `backend`, `frontend-web` et `frontend-admin`,
puis supprimer l'exception de `security/audit-allowlist.json`.

## Périmètre à vérifier

- Tous les schémas `*.schemas.ts` du backend et le middleware `validate` (format des erreurs 422).
- `errorMap`, `required_error`, `invalid_type_error` : remplacés par l'option `error` en zod 4.
- `z.string().email()/uuid()/datetime()` : formats plus stricts en zod 4 (UUID notamment).
- `.strict()`, `.passthrough()`, `.refine()` et `ZodError.issues` (messages et chemins).
- Frontends : `@hookform/resolvers` doit être compatible zod 4 (mettre à jour en même temps).

## Critères d'acceptation

1. `npm audit --omit=dev` ne signale plus GHSA-mrhx-c7xc-m3w5 dans les trois applications.
2. Tous les tests passent ; les réponses 422 gardent le même format (`error`, `code`, `errors`).
3. L'entrée zod est retirée de `audit-allowlist.json` (le pipeline l'indique « à retirer »).

## Réalisation (2026-11-25)

- zod 4.6.7 (épinglé) dans backend, frontend-web et frontend-admin ;
  @hookform/resolvers 5.9.2 (compatible zod 3.25 et 4, react-hook-form ≥ 7.55).
- `errorMap` → `error`, `required_error`/`invalid_type_error` → `error` (fonction),
  `z.ZodIssueCode.custom` → `'custom'`, `ZodSchema` → `ZodType`.
- Piège corrigé : en zod 4, `.partial()` d'un schéma muni de `.default()` réapplique
  les valeurs par défaut aux champs absents (une modification partielle aurait remis
  une page en brouillon). Les schémas de modification n'ont plus de valeur par défaut ;
  test de non-régression `tests/unit/schemas.zod4.test.ts`.
- Format des réponses 422 inchangé (testé).
- Critères d'acceptation 1 à 3 : remplis (audit à 0, tests verts, exception retirée).
