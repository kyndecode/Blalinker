# Stockage des fichiers (Cloudinary)

Les fichiers envoyés par les utilisateurs sont stockés chez Cloudinary. **Sans configuration,
aucun envoi n'est possible** : l'API répond `503` avec le message « L’envoi de fichiers est
momentanément indisponible… » (`code: STORAGE_UNAVAILABLE`). Conséquence directe : un prestataire
ne peut pas envoyer sa pièce d'identité, donc ne peut pas être validé ni apparaître sur le site.

État constaté le 27/11/2026 : variables **absentes** sur Render (production).

## Variables (service Render de l'API uniquement)

| Variable | Où la trouver | Remarque |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary → *Settings → API Keys* (« Cloud name ») | non secret |
| `CLOUDINARY_API_KEY` | même page (« API Key ») | identifiant |
| `CLOUDINARY_API_SECRET` | même page (« API Secret ») | **secret** : uniquement sur Render, jamais sur Vercel, dans le dépôt ou dans un message |

Les trois sont nécessaires (`isCloudinaryConfigured()`, `backend/src/config/cloudinary.ts`).
Après saisie : Render → *Save, rebuild, and deploy*.

Le compte gratuit (sans carte bancaire) suffit au démarrage : environ 25 Go de stockage ou de
bande passante par mois.

## Ce qui est stocké

| Fichier | Route | Dossier Cloudinary | Accès |
|---|---|---|---|
| Photo de profil | `POST /api/v1/uploads/avatar` | `bla/avatars/<utilisateur>` | public (JPEG, PNG, WebP ; 6 Mo max.) |
| Pièce d'identité | `POST /api/v1/uploads/id-card` | `bla/kyc/<utilisateur>` | **authenticated** : lisible seulement par une URL signée générée par l'API pour un membre habilité de l'équipe (photo ou PDF ; 6 Mo max.) |
| Médiathèque du site | administration → Médiathèque | `bla/site` | public |

Le type réel du fichier est vérifié par son contenu (pas seulement par l'extension) avant envoi.

## Vérifier l'activation (sans compte, de l'extérieur)

```
GET https://api.blalinker.com/api/v1/site/health
→ {"status":"ok","checks":{"database":true,"cache":true,"storage":true}}
```

`storage: false` : au moins une des trois variables manque. L'indicateur est un simple booléen,
aucune valeur de configuration n'est renvoyée.

Ensuite, test réel : depuis l'espace prestataire, envoyer une photo de profil ; le message
« Votre photo de profil a été mise à jour. » confirme l'envoi.

## Pièces d'identité déjà enregistrées

Vérifié le 27/11/2026 : `SELECT count(*) FROM profiles WHERE id_card_url IS NOT NULL;` → `0`.
Aucun document antérieur à protéger. Si ce nombre devient non nul avant l'activation de la
livraison « authenticated », voir `npm run kyc:protect-documents` (simulation puis `--confirm`),
à lancer depuis un poste de confiance (procédure dans `MISE-EN-PRODUCTION.md`, point 7).

## En cas de fuite du secret

Cloudinary → *Settings → API Keys* : générer une nouvelle paire, la saisir sur Render,
redéployer, puis révoquer l'ancienne.
