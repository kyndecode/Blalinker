import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { maskPhone } from './mask.util';

/**
 * Canal SMS (Twilio) — FACULTATIF.
 * Sans TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER, le canal est
 * considéré comme indisponible : les OTP partent uniquement par e-mail et aucun
 * appel à Twilio n'est tenté (voir AuthService._sendOtp).
 */
let client: ReturnType<typeof twilio> | null = null;

/** Le canal SMS est-il entièrement configuré ? */
export function isSmsConfigured(): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_PHONE_NUMBER);
}

function getClient() {
  if (!isSmsConfigured()) return null;
  if (!client) {
    try {
      client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    } catch (err) {
      logger.error('Configuration Twilio invalide : canal SMS indisponible', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
  return client;
}

const SMS_TEMPLATES = {
  otp_register:      (code: string) => `Votre code BLA est : ${code}. Valable 10 minutes. Ne le partagez jamais.`,
  otp_login:         (code: string) => `Code de connexion BLA : ${code}. Si vous n'êtes pas à l'origine de cette demande, changez votre mot de passe.`,
  otp_password_reset:(code: string) => `BLA : code de réinitialisation ${code}. Valable 10 minutes.`,
  otp_payment:       (code: string) => `BLA : confirmez votre paiement avec le code ${code}.`,
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
    const isTestRuntime = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';
    if (env.NODE_ENV === 'production' && !isTestRuntime) {
      logger.debug(`[SMS] Canal SMS non configuré : SMS ignoré (${maskPhone(phone)})`);
      return false;
    }
    // Hors production uniquement : le contenu est affiché pour faciliter le développement.
    logger.debug(`[SMS DEV] À: ${maskPhone(phone)} — ${(SMS_TEMPLATES[template] as (...args: unknown[]) => string)(...(params as unknown[]))}`);
    return true;
  }

  try {
    const body = (SMS_TEMPLATES[template] as (...args: unknown[]) => string)(...(params as unknown[]));
    await c.messages.create({
      body,
      from: env.TWILIO_PHONE_NUMBER!,
      to: phone,
    });
    logger.info('SMS envoyé', { to: maskPhone(phone), template });
    return true;
  } catch (err) {
    logger.error('Erreur envoi SMS', {
      to: maskPhone(phone),
      template,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
