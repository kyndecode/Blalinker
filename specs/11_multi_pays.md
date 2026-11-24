# 11 — Marchés et architecture multi-pays

État au 2026-11-24 (audit du lot 0, lecture du code uniquement). Aucune donnée de
production n'a été consultée ; aucun numéro de téléphone n'a été modifié.

## 1. Ce que le code révèle des marchés

| Indice | Où | Pays |
|---|---|---|
| Pays par défaut d'un nouveau profil | `schema.prisma` (`Profile.country @default("SN")`), `auth.service.ts` (inscription Google), `providers.controller.ts` | Sénégal |
| Pays par défaut à la mise à jour du profil et des membres admin | `users.controller.ts`, `team.controller.ts` | Côte d'Ivoire |
| Indicatif proposé par défaut à l'inscription | `frontend-web/src/utils/phoneCountries.ts` (SN, puis repli) ; exemple `+221 77…` dans `fr.json` | Sénégal |
| Téléphone de contact publié | pied de page et page Contact : `+225 07 20 33 39 97` | Côte d'Ivoire |
| Langue locale | `wo.json` (wolof, 27 lignes, très incomplet) | Sénégal |
| Moyens de paiement cités | Wave, Orange Money (SN et CI), Free Money (SN), MTN MoMo (enum `TransactionMethod`, CI) | Sénégal et Côte d'Ivoire |
| Devise | `XOF` partout (franc CFA UEMOA, commun aux six pays cités) | — |
| Textes marketing | « Disponible en Côte d'Ivoire · Togo · Mali · Burkina Faso », drapeaux 🇹🇬 🇨🇮 🇲🇱 🇧🇫 | CI, TG, ML, BF (le Sénégal n'y figure pas) |

**Conclusion provisoire :** le code vise surtout le **Sénégal** (choix par défaut,
wolof, Free Money) et la **Côte d'Ivoire** (téléphone, MTN MoMo, textes). Les textes
publics annoncent aussi le Togo, le Mali et le Burkina Faso. Ces indices se
contredisent : seule la répartition réelle des comptes permet de trancher.

### Requêtes de vérification (lecture seule, à exécuter par le propriétaire sur Supabase)

```sql
-- Pays déclarés dans les profils
SELECT country, count(*) AS comptes FROM profiles GROUP BY country ORDER BY comptes DESC;

-- Indicatifs téléphoniques réels (4 premiers caractères, aucun numéro complet)
SELECT left(phone, 4) AS indicatif, count(*) AS comptes
FROM users WHERE phone IS NOT NULL AND deleted_at IS NULL
GROUP BY 1 ORDER BY 2 DESC;
```

## 2. Architecture cible (lot 2)

Objectif : ajouter, retirer ou ajuster un pays **depuis l'administration**, sans
déploiement, et supprimer les valeurs par défaut contradictoires du code.

### Données (migration additive, aucune colonne existante modifiée)

- `countries` : `code` (ISO 3166-1, clé), `name`, `dial_code`, `currency` (XOF…),
  `default_locale` (fr), `locales` (ex. `["fr","wo"]`), `timezone`, `enabled`,
  `sort_order`, `payment_methods` (liste parmi l'enum existant).
- `site_settings` : `key`, `value` (JSON), `country_code` **nullable** (vide = valeur
  globale, renseigné = surcharge pour ce pays) ; contient les coordonnées de contact
  (e-mail, téléphone, adresse), les réseaux sociaux, les seuils d'affichage des
  statistiques publiques.
- Zones géographiques : `service_areas` (pays, ville, centre lat/lng, rayon) si
  l'activité doit être limitée à certaines villes.

### Règles

- Le pays par défaut d'un profil devient celui choisi à l'inscription (indicatif
  du téléphone), jamais une valeur codée en dur.
- Validation des numéros : uniquement les indicatifs des pays `enabled`.
- Devise affichée et moyens de paiement proposés selon le pays de la réservation.
- Langue : `default_locale` du pays, avec choix utilisateur ; le wolof n'est proposé
  qu'une fois sa traduction complète.
- Les coordonnées affichées sur le site (`frontend-web/src/config/site.ts`, lot 0)
  seront lues depuis `site_settings` (API publique en cache), avec les valeurs
  actuelles comme repli.

### Administration

Écrans « Pays » et « Paramètres » : ajouter / modifier / désactiver (jamais
supprimer un pays utilisé par des comptes ou des réservations), journal d'audit,
permission dédiée `settings.manage` réservée au super-administrateur par défaut.

## 3. Réalisé au lot 2 (2026-11-25)

- Tables `countries` (code ISO, indicatif, devise, langue, actif) et `site_settings`
  (portée `global` ou code pays) — **vides à la création** : aucun marché n'est présupposé.
- Administration : pages « Pays » et « Paramètres » (permission `settings.manage`) ;
  une valeur par pays remplace la valeur globale.
- Site : bandeau des pays desservis affiché seulement pour les pays actifs ; pays actifs en
  tête des listes d'indicatifs (inscription, contact) ; pays proposé par défaut =
  navigateur, puis paramètre `markets.defaultCountry`, sinon choix explicite.
- Annonces ciblables par pays.

## 4. Paramètres restant à renseigner par l'exploitant

1. Pays réellement desservis (page « Pays », activer ceux qui le sont).
2. `markets.defaultCountry` si un pays doit être proposé par défaut.
3. Coordonnées par pays (`contact.phone`, `contact.address`…) si elles diffèrent.

## 5. Présupposés encore présents dans le code (à traiter après confirmation des marchés)

| Présupposé | Où | Effet |
|---|---|---|
| `Profile.country @default("SN")` | `schema.prisma` (valeur par défaut en base) | profil créé sans pays → SN ; changer la valeur par défaut demande une migration (non faite sans décision) |
| Pays par défaut `SN` à l'inscription Google, `CI` dans quelques mises à jour de profil | `auth.schemas.ts`, `users.controller.ts`, `team.controller.ts`, `uploads.controller.ts` | idem |
| Centre de la carte (mode carte de la recherche) | `SearchPage.tsx` : Abidjan si la géolocalisation est refusée | affichage uniquement |
| Devise `XOF` | services, réservations, tableau de bord | cohérent tant que les marchés sont en zone UEMOA |

Les requêtes SQL en lecture seule du §1 permettent de confirmer la répartition réelle
avant de modifier ces valeurs.
