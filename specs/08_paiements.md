# Paiements & Intégration Mobile Money — BLA

## 1. Solutions de paiement supportées

| Méthode | Pays | Frais | API |
|---------|------|-------|-----|
| Wave | Sénégal, Côte d'Ivoire, Mali, Cameroun | 1% | wave.com/api |
| Orange Money | Sénégal, Côte d'Ivoire, Cameroun, Mali | 1-2% | orange-developer.com |
| Free Money | Sénégal | 0% | free.sn API |
| MTN MoMo | Cameroun, Côte d'Ivoire, Ghana | 1% | momodeveloper.mtn.com |
| Espèces | Tous | 0% | Manuel (validation admin) |

---

## 2. Flux de paiement complet

```
Client                    API BLA                   Wave API
  │                          │                           │
  │ [Valider réservation]    │                           │
  │──────────────────────── >│                           │
  │                          │── Créer transaction       │
  │                          │   status: pending         │
  │                          │                           │
  │                          │── POST /v1/checkout ─────>│
  │                          │   {amount, ref, urls}     │
  │                          │                           │
  │                          │<── {wave_launch_url} ─────│
  │<── {payment_url} ────────│                           │
  │                          │                           │
  │── Ouvre Wave App ────────────────────────────────────│
  │   Confirme paiement      │                           │
  │                          │                           │
  │                          │<── Webhook POST ──────────│
  │                          │   {status: completed}     │
  │                          │                           │
  │                          │── Valider signature HMAC  │
  │                          │── Mettre à jour transaction│
  │                          │── Débloquer paiement      │
  │                          │   (séquestre → prestataire│
  │                          │    après validation client)│
  │                          │                           │
  │<── Notification push ────│                           │
  │    "Paiement confirmé"   │                           │
```

---

## 3. Système de séquestre (Escrow)

Le paiement n'est pas versé immédiatement au prestataire. Il est conservé par la plateforme jusqu'à validation du client.

```
Timeline d'un paiement :
──────────────────────────────────────────────────────────────

Réservation    Paiement      Mission        Validation    Déblocage
créée          effectué      terminée       client        prestataire
    │              │             │               │              │
    ▼              ▼             ▼               ▼              ▼
────●──────────────●─────────────●───────────────●──────────────●──
                              Prestataire    Client             Fonds
                              marque        valide ou          transférés
                              "terminé"     attend 48h         (moins 5%)
                                            auto-validation

Note: Si le client ne valide pas dans 48h → validation automatique
      Si litige → l'admin tranche et débloquer manuellement
```

---

## 4. Commissions

```typescript
// Calcul des commissions
interface CommissionConfig {
  baseRate: number;       // 5% par défaut
  minAmount: number;      // 500 XOF minimum
  maxAmount: number;      // 50 000 XOF maximum
  newProviderRate: number; // 3% les 3 premiers mois
  premiumRate: number;    // 4% pour prestataires premium
}

function calculateCommission(amount: number, provider: Provider): {
  commission: number;
  netAmount: number;
} {
  let rate = 0.05;
  if (provider.isPremium) rate = 0.04;
  if (isNewProvider(provider)) rate = 0.03;

  const commission = Math.min(
    Math.max(amount * rate, 500),
    50000
  );

  return {
    commission: Math.round(commission),
    netAmount: amount - Math.round(commission)
  };
}
```

---

## 5. Intégration Wave

### 5.1 Initier un checkout
```typescript
// src/modules/payments/wave.service.ts
export class WavePaymentService {
  private readonly baseUrl = 'https://api.wave.com/v1';

  async createCheckout(params: {
    amount: number;
    currency: 'XOF' | 'GNF';
    bookingId: string;
    clientPhone: string;
  }): Promise<{ checkoutUrl: string; sessionId: string }> {
    const response = await axios.post(
      `${this.baseUrl}/checkout/sessions`,
      {
        currency: params.currency,
        amount: params.amount.toString(),
        error_url:   `${process.env.APP_URL}/payment/error?ref=${params.bookingId}`,
        success_url: `${process.env.APP_URL}/payment/success?ref=${params.bookingId}`,
        client_reference: params.bookingId,
        restrict_bill_to: { mobile: params.clientPhone }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WAVE_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      checkoutUrl: response.data.wave_launch_url,
      sessionId: response.data.id
    };
  }

  // Vérifier la signature du webhook
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const expected = crypto
      .createHmac('sha256', process.env.WAVE_WEBHOOK_SECRET!)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  }

  async handleWebhook(event: WaveWebhookEvent): Promise<void> {
    if (event.type === 'checkout.session.completed') {
      const transaction = await prisma.transaction.findFirst({
        where: { externalRef: event.data.id }
      });

      if (!transaction) return;

      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'completed', paidAt: new Date() }
      });

      // Notifier le client et le prestataire
      await notificationService.send({
        userId: transaction.payerId,
        type: 'PAYMENT_CONFIRMED',
        title: 'Paiement confirmé',
        body: `Votre paiement de ${transaction.amount} XOF a été confirmé.`
      });
    }
  }
}
```

---

## 6. Intégration Orange Money

```typescript
// Orange Money utilise OAuth 2.0 + API REST
export class OrangeMoneyService {
  private accessToken: string | null = null;

  async getAccessToken(): Promise<string> {
    const response = await axios.post(
      'https://api.orange.com/oauth/v3/token',
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.ORANGE_CLIENT_ID}:${process.env.ORANGE_CLIENT_SECRET}`
          ).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data.access_token;
  }

  async initiatePayment(params: {
    amount: number;
    currency: string;
    orderRef: string;
    notifUrl: string;
    returnUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const token = await this.getAccessToken();

    const response = await axios.post(
      `https://api.orange.com/orange-money-webpay/dev/v1/webpayment`,
      {
        merchant_key: process.env.ORANGE_MERCHANT_KEY,
        currency: params.currency,
        order_id: params.orderRef,
        amount: params.amount,
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
        notif_url: params.notifUrl,
        lang: 'fr',
        reference: params.orderRef
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return response.data.payment_url;
  }
}
```

---

## 7. Gestion des remboursements et litiges

```typescript
// Politique de remboursement
const REFUND_POLICY = {
  // Annulation avant acceptation : remboursement 100%
  beforeAcceptance: 1.0,
  // Annulation après acceptation, 24h avant : remboursement 80%
  after24h: 0.8,
  // Annulation moins de 2h avant : remboursement 50%
  lessThan2h: 0.5,
  // Mission déjà commencée : pas de remboursement automatique (litige admin)
  inProgress: null,
};
```

---

## 8. Sécurité des paiements

- Tous les webhooks sont **vérifiés par signature HMAC** avant traitement
- Les montants sont toujours recalculés **côté serveur** (jamais côté client)
- Les transactions utilisent des **références idempotentes** (évite les doubles débits)
- Journalisation de **chaque étape** dans `audit_logs`
- Alerte admin automatique si remboursement > 100 000 XOF
- Rate limiting sur les endpoints de paiement (max 10 initiations/heure/user)
