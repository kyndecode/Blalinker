# Tâche — Migration vers zod 4

**Statut :** à faire (planifiée au lot 3) · **Échéance :** avant le 2027-01-31,
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
