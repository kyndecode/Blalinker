# Notifications — BLA

## 1. Canaux de notification

| Canal | Usage | Fournisseur |
|-------|-------|-------------|
| SMS | OTP, alertes sécurité, confirmations paiement | Twilio / Orange SMS API |
| Push Mobile | Toutes les notifications temps réel | Expo Notifications (FCM/APNs) |
| In-App | Notifications dans l'application | WebSocket + base de données |
| Email | Confirmation inscription, factures, résumés | SendGrid |

---

## 2. Matrice des notifications

| Événement | SMS | Push | In-App | Email |
|-----------|-----|------|--------|-------|
| Inscription — OTP | ✅ | - | - | - |
| Connexion — OTP MFA | ✅ | - | - | - |
| Pièce d'identité validée | ✅ | ✅ | ✅ | ✅ |
| Pièce d'identité rejetée | ✅ | ✅ | ✅ | ✅ |
| Nouvelle réservation (prestataire) | - | ✅ | ✅ | - |
| Réservation acceptée (client) | ✅ | ✅ | ✅ | - |
| Réservation refusée (client) | - | ✅ | ✅ | - |
| Prestataire en route | - | ✅ | ✅ | - |
| Prestataire arrivé | ✅ | ✅ | ✅ | - |
| Mission terminée | - | ✅ | ✅ | - |
| Paiement confirmé | ✅ | ✅ | ✅ | ✅ |
| Paiement reçu (prestataire) | ✅ | ✅ | ✅ | - |
| Nouvel avis reçu | - | ✅ | ✅ | - |
| Litige ouvert | ✅ | ✅ | ✅ | ✅ |
| Litige résolu | ✅ | ✅ | ✅ | ✅ |
| Connexion depuis nouvel appareil | ✅ | ✅ | ✅ | ✅ |
| Signalement reçu (admin) | - | - | ✅ | ✅ |

---

## 3. Implémentation du service de notifications

```typescript
// src/modules/notifications/notification.service.ts

interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels?: ('push' | 'sms' | 'email' | 'in_app')[];
}

export class NotificationService {

  async send(payload: NotificationPayload): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { profile: true }
    });
    if (!user) return;

    const channels = payload.channels || ['push', 'in_app'];

    // Exécuter en parallèle tous les canaux
    await Promise.allSettled([
      channels.includes('in_app')  && this.saveInApp(payload),
      channels.includes('push')    && this.sendPush(user, payload),
      channels.includes('sms')     && this.sendSMS(user, payload),
      channels.includes('email')   && this.sendEmail(user, payload),
    ]);
  }

  private async saveInApp(payload: NotificationPayload): Promise<void> {
    await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data || {}
      }
    });

    // Notifier en temps réel via Socket.IO
    io.to(`user:${payload.userId}`).emit('notification', {
      type: payload.type,
      title: payload.title,
      body: payload.body,
    });
  }

  private async sendPush(user: User, payload: NotificationPayload): Promise<void> {
    const pushToken = await redis.get(`push_token:${user.id}`);
    if (!pushToken) return;

    // Expo Push Notifications
    await axios.post('https://exp.host/--/api/v2/push/send', {
      to: pushToken,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: 'default',
      channelId: 'default',
    });
  }

  private async sendSMS(user: User, payload: NotificationPayload): Promise<void> {
    if (!user.phone) return;

    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    await twilioClient.messages.create({
      body: `BLA: ${payload.body}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: user.phone
    });
  }

  private async sendEmail(user: User, payload: NotificationPayload): Promise<void> {
    if (!user.email) return;
    // Implémentation SendGrid
  }
}
```

---

## 4. Templates de messages SMS

```typescript
const SMS_TEMPLATES = {
  OTP_REGISTER: (code: string) =>
    `Votre code de vérification BLA est : ${code}. Valable 10 minutes. Ne le partagez jamais.`,

  OTP_LOGIN: (code: string) =>
    `Code de connexion BLA : ${code}. Si vous n'êtes pas à l'origine de cette demande, changez votre mot de passe.`,

  BOOKING_ACCEPTED: (providerName: string) =>
    `BLA: ${providerName} a accepté votre réservation. Suivez son arrivée dans l'application.`,

  PROVIDER_ARRIVED: (providerName: string) =>
    `BLA: ${providerName} est arrivé à votre adresse.`,

  PAYMENT_CONFIRMED: (amount: number, currency: string) =>
    `BLA: Paiement de ${amount} ${currency} confirmé. Merci pour votre confiance.`,

  SECURITY_ALERT: (city: string) =>
    `BLA Sécurité: Nouvelle connexion depuis ${city}. Si ce n'est pas vous, changez votre mot de passe immédiatement.`,
};
```

---

## 5. Préférences de notification

Les utilisateurs peuvent personnaliser leurs notifications :
- Désactiver les notifications marketing
- Choisir les canaux pour chaque type d'événement
- Plages horaires "Ne pas déranger" (ex. 22h-7h)
- Langue des notifications (fr/wo/en)
