/**
 * Contrat OpenAPI 3.0 (partiel mais représentatif) de l'API BLA.
 * Servi tel quel sur GET /openapi.json — importable dans Swagger UI / Postman / Insomnia.
 */

const bearer = [{ bearerAuth: [] }];
const okJson = { description: 'Succès' };

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'BLA Services API',
    version: '1.0.0',
    description:
      "API de la marketplace BLA (Afrique de l'Ouest). Auth par JWT Bearer ; " +
      "les clients web envoient X-Auth-Mode: cookie pour gérer le refresh via cookie HttpOnly.",
  },
  servers: [
    { url: 'https://api.blalinker.com/api/v1', description: 'Production' },
    { url: 'http://localhost:3000/api/v1', description: 'Local' },
  ],
  tags: [
    { name: 'Auth' }, { name: 'Users' }, { name: 'Providers' }, { name: 'Bookings' },
    { name: 'Payments' }, { name: 'Payouts' }, { name: 'Reviews' }, { name: 'Notifications' },
    { name: 'Reports' }, { name: 'Uploads' }, { name: 'Admin' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    responses: {
      Unauthorized: { description: 'Non authentifié' },
      Forbidden: { description: 'Permission insuffisante' },
      ValidationError: { description: 'Données invalides (422)' },
    },
  },
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Créer un compte (envoie un OTP)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['firstName', 'lastName', 'countryCode', 'phone', 'email', 'password', 'role'],
            properties: {
              firstName: { type: 'string' }, lastName: { type: 'string' },
              countryCode: { type: 'string', example: 'CI' },
              phone: { type: 'string', example: '+2250701020304' },
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 8 },
              role: { type: 'string', enum: ['client', 'provider'] },
              captchaToken: { type: 'string' },
            },
          } } },
        },
        responses: { 201: okJson, 422: { $ref: '#/components/responses/ValidationError' } },
      },
    },
    '/auth/verify-otp': {
      post: { tags: ['Auth'], summary: "Valider l'OTP d'inscription", responses: { 200: okJson } },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Connexion (peut renvoyer mfaRequired + tempToken)',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', properties: {
            email: { type: 'string' }, phone: { type: 'string' }, password: { type: 'string' },
          },
        } } } },
        responses: { 200: okJson, 401: { $ref: '#/components/responses/Unauthorized' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/auth/login/verify-mfa': { post: { tags: ['Auth'], summary: 'Valider OTP de connexion (MFA)', responses: { 200: okJson } } },
    '/auth/forgot-password': { post: { tags: ['Auth'], summary: 'Demander un code de réinitialisation', responses: { 200: okJson } } },
    '/auth/reset-password': { post: { tags: ['Auth'], summary: 'Réinitialiser le mot de passe via OTP', responses: { 200: okJson } } },
    '/auth/refresh-token': { post: { tags: ['Auth'], summary: 'Rafraîchir les tokens (cookie ou body)', responses: { 200: okJson, 401: { $ref: '#/components/responses/Unauthorized' } } } },
    '/auth/logout': { post: { tags: ['Auth'], summary: 'Déconnexion', security: bearer, responses: { 200: okJson } } },

    '/users/me': {
      get: { tags: ['Users'], summary: 'Mon profil', security: bearer, responses: { 200: okJson, 401: { $ref: '#/components/responses/Unauthorized' } } },
      patch: { tags: ['Users'], summary: 'Mettre à jour mon profil', security: bearer, responses: { 200: okJson } },
    },

    '/providers/search': {
      get: {
        tags: ['Providers'], summary: 'Recherche géolocalisée de prestataires',
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'radius', in: 'query', schema: { type: 'number', default: 10 } },
          { name: 'category_id', in: 'query', schema: { type: 'string', format: 'uuid' } },
          { name: 'min_rating', in: 'query', schema: { type: 'number' } },
          { name: 'max_price', in: 'query', schema: { type: 'number' } },
        ],
        responses: { 200: okJson },
      },
    },
    '/providers/{id}': { get: { tags: ['Providers'], summary: 'Profil public prestataire', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: okJson, 404: { description: 'Introuvable' } } } },
    '/providers/me/profile': {
      get: { tags: ['Providers'], summary: 'Mon profil prestataire', security: bearer, responses: { 200: okJson } },
      put: { tags: ['Providers'], summary: 'Mettre à jour (dont latitude/longitude)', security: bearer, responses: { 200: okJson } },
    },
    '/providers/me/services': {
      get: { tags: ['Providers'], summary: 'Mes services', security: bearer, responses: { 200: okJson } },
      post: { tags: ['Providers'], summary: 'Créer un service', security: bearer, responses: { 201: okJson } },
    },

    '/bookings': {
      get: { tags: ['Bookings'], summary: 'Mes réservations', security: bearer, responses: { 200: okJson } },
      post: { tags: ['Bookings'], summary: 'Créer une réservation (montant = prix du service)', security: bearer, responses: { 201: okJson, 400: { description: 'Service/prix requis' } } },
    },
    '/bookings/{id}/validate': { put: { tags: ['Bookings'], summary: 'Valider (libère l\'escrow)', security: bearer, responses: { 200: okJson } } },

    '/payments/init': { post: { tags: ['Payments'], summary: 'Initier un paiement (CinetPay/Stripe)', security: bearer, responses: { 200: okJson } } },
    '/payments/webhook/cinetpay': { post: { tags: ['Payments'], summary: 'Webhook CinetPay (vérifié + re-checké)', responses: { 200: okJson } } },
    '/payments/webhook/stripe': { post: { tags: ['Payments'], summary: 'Webhook Stripe (signature vérifiée)', responses: { 200: okJson } } },

    '/payouts/me/balance': { get: { tags: ['Payouts'], summary: 'Mon solde (disponible/escrow)', security: bearer, responses: { 200: okJson } } },
    '/payouts/me/request': { post: { tags: ['Payouts'], summary: 'Demander un retrait', security: bearer, responses: { 201: okJson } } },

    '/reviews': { post: { tags: ['Reviews'], summary: 'Laisser un avis (modéré)', security: bearer, responses: { 201: okJson } } },
    '/reviews/{id}/respond': { put: { tags: ['Reviews'], summary: 'Réponse du prestataire', security: bearer, responses: { 200: okJson } } },

    '/notifications': { get: { tags: ['Notifications'], summary: 'Mes notifications', security: bearer, responses: { 200: okJson } } },
    '/notifications/read-all': { patch: { tags: ['Notifications'], summary: 'Tout marquer comme lu', security: bearer, responses: { 200: okJson } } },

    '/reports': { post: { tags: ['Reports'], summary: 'Signaler un utilisateur', security: bearer, responses: { 201: okJson } } },

    '/uploads/avatar': { post: { tags: ['Uploads'], summary: 'Photo de profil (multipart)', security: bearer, responses: { 200: okJson, 503: { description: 'Stockage non configuré' } } } },
    '/uploads/id-card': { post: { tags: ['Uploads'], summary: 'Pièce d\'identité (KYC, multipart)', security: bearer, responses: { 200: okJson } } },

    '/admin/dashboard': { get: { tags: ['Admin'], summary: 'KPIs', security: bearer, responses: { 200: okJson, 403: { $ref: '#/components/responses/Forbidden' } } } },
    '/admin/team': {
      get: { tags: ['Admin'], summary: 'Équipe admin (perm admins.manage)', security: bearer, responses: { 200: okJson } },
      post: { tags: ['Admin'], summary: 'Créer un membre admin', security: bearer, responses: { 201: okJson } },
    },
    '/admin/audit': { get: { tags: ['Admin'], summary: 'Journal d\'audit (perm audit.read)', security: bearer, responses: { 200: okJson } } },
    '/admin/payouts': { get: { tags: ['Admin'], summary: 'Retraits (perm payments.read)', security: bearer, responses: { 200: okJson } } },
    '/admin/transactions/{id}/refund': { post: { tags: ['Admin'], summary: 'Rembourser (perm payments.refund)', security: bearer, responses: { 200: okJson } } },
  },
} as const;
