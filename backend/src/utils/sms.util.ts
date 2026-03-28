import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    logger.warn('Twilio non configuré — SMS désactivé (mode dev)');
    return null;
  }
  if (!client) {
    client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

const SMS_TEMPLATES = {
  otp_register:      (code: string) => `Votre code BLA est : ${code}. Valable 10 minutes. Ne le partagez jamais.`,
  otp_login:         (code: string) => `Code de connexion BLA : ${code}. Si vous n'êtes pas à l'origine de cette demande, changez votre mot de passe.`,
  otp_password_reset:(code: string) => `BLA — Code de réinitialisation : ${code}. Valable 10 minutes.`,
  otp_payment:       (code: string) => `BLA — Confirmez votre paiement avec le code : ${code}.`,
  booking_accepted:  (name: string) => `BLA: ${name} a accepté votre réservation. Suivez-le dans l'application.`,
  booking_arrived:   (name: string) => `BLA: ${name} est arrivé à votre adresse.`,
  payment_confirmed: (amount: number, currency: string) => `BLA: Paiement de ${amount} ${currency} confirmé. Merci !`,
  security_alert:    (city: string) => `BLA Sécurité: Connexion depuis ${city}. Si ce n'est pas vous, changez votre mot de passe.`,
};

export type SmsTemplate = keyof typeof SMS_TEMPLATES;

export async function sendSMS(
  phone: string,
  template: SmsTemplate,
  params: Parameters<(typeof SMS_TEMPLATES)[SmsTemplate]>
): Promise<boolean> {
  const c = getClient();
  if (!c) {
    logger.debug(`[SMS DEV] À: ${phone} — ${(SMS_TEMPLATES[template] as (...args: unknown[]) => string)(...(params as unknown[]))}`);
    return true;
  }

  try {
    const body = (SMS_TEMPLATES[template] as (...args: unknown[]) => string)(...(params as unknown[]));
    await c.messages.create({
      body,
      from: env.TWILIO_PHONE_NUMBER!,
      to: phone,
    });
    logger.info(`SMS envoyé à ${phone} (template: ${template})`);
    return true;
  } catch (err) {
    logger.error(`Erreur envoi SMS à ${phone}:`, err);
    return false;
  }
}
