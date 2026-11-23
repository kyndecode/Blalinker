/**
 * BLA — Service Email via Brevo (ex-Sendinblue)
 * API transactionnelle : OTP, confirmations, alertes
 * https://developers.brevo.com/reference/sendtransacemail
 */
import axios from 'axios';
import { env } from './env';
import { logger } from './logger';
import { maskEmail } from '../utils/mask.util';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/** Délai maximal d'un appel à Brevo (sans délai, une panne Brevo bloquerait la requête). */
export const BREVO_TIMEOUT_MS = 10_000;

interface EmailPayload {
  to:       string;
  name?:    string;
  subject:  string;
  html:     string;
  text?:    string;
}

export type EmailFailureKind =
  | 'ip_not_authorized'
  | 'invalid_api_key'
  | 'invalid_sender'
  | 'insufficient_credits'
  | 'rate_limited'
  | 'rejected'
  | 'provider_error'
  | 'timeout'
  | 'network';

export interface EmailFailure {
  kind: EmailFailureKind;
  status?: number;
  providerMessage?: string;
  /** Message technique pour les échecs sans réponse HTTP (ex. ENOTFOUND). Jamais d'en-tête ni de clé. */
  detail?: string;
}

/** Action à mener selon la cause, écrite dans le journal (aucun secret). */
export const EMAIL_FAILURE_HINTS: Record<EmailFailureKind, string> = {
  ip_not_authorized:
    'Adresse IP du serveur non autorisée par Brevo : autoriser les plages sortantes Render (Connect > Outbound) dans Brevo > Security > Authorized IPs.',
  invalid_api_key: 'Clé API Brevo refusée (absente, invalide ou révoquée) : vérifier BREVO_API_KEY.',
  invalid_sender: 'Expéditeur refusé par Brevo : vérifier que BREVO_FROM_EMAIL figure dans Brevo > Senders.',
  insufficient_credits: "Crédits d'envoi Brevo épuisés.",
  rate_limited: 'Trop de requêtes vers Brevo (limite atteinte).',
  rejected: 'Requête refusée par Brevo (voir le message du fournisseur).',
  provider_error: 'Erreur interne Brevo (réessayer plus tard).',
  timeout: `Brevo n'a pas répondu en ${BREVO_TIMEOUT_MS / 1000} s.`,
  network: 'Brevo injoignable (réseau ou DNS).',
};

/** Identifie la cause d'un échec d'appel à l'API Brevo. */
export function classifyBrevoError(err: unknown): EmailFailure {
  const e = err as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { code?: string; message?: string } };
  };
  const detail = typeof e?.message === 'string' ? e.message.slice(0, 200) : undefined;
  if (e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT') return { kind: 'timeout', detail };

  const status = e?.response?.status;
  if (!status) return { kind: 'network', detail };

  const rawMessage = e.response?.data?.message;
  const providerMessage = typeof rawMessage === 'string' ? rawMessage.slice(0, 300) : undefined;
  const message = providerMessage ?? '';

  if (status === 401 && /ip address/i.test(message)) return { kind: 'ip_not_authorized', status, providerMessage };
  if (status === 401) return { kind: 'invalid_api_key', status, providerMessage };
  if (status === 400 && /sender/i.test(message)) return { kind: 'invalid_sender', status, providerMessage };
  if (status === 402) return { kind: 'insufficient_credits', status, providerMessage };
  if (status === 429) return { kind: 'rate_limited', status, providerMessage };
  if (status >= 500) return { kind: 'provider_error', status, providerMessage };
  return { kind: 'rejected', status, providerMessage };
}

/** Le canal e-mail est-il configuré (clé Brevo présente) ? */
export function isEmailConfigured(): boolean {
  return Boolean(env.BREVO_API_KEY);
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    const isTestRuntime = process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';
    if (env.NODE_ENV === 'production' && !isTestRuntime) {
      logger.error('[EMAIL] BREVO_API_KEY absente en production : e-mail non envoyé', {
        to: maskEmail(payload.to),
        subject: payload.subject,
      });
      return false;
    }
    logger.debug(`[EMAIL DEV] À: ${maskEmail(payload.to)} | Sujet: ${payload.subject}`);
    return true;
  }

  try {
    await axios.post(
      BREVO_API_URL,
      {
        sender:       { email: env.BREVO_FROM_EMAIL, name: env.BREVO_FROM_NAME },
        to:           [{ email: payload.to, name: payload.name ?? payload.to }],
        subject:      payload.subject,
        htmlContent:  payload.html,
        textContent:  payload.text ?? stripHtml(payload.html),
      },
      {
        timeout: BREVO_TIMEOUT_MS,
        headers: {
          'api-key':     env.BREVO_API_KEY,
          'Content-Type':'application/json',
          'Accept':      'application/json',
        },
      }
    );
    logger.info('Email envoyé', { to: maskEmail(payload.to), subject: payload.subject });
    return true;
  } catch (err: unknown) {
    const failure = classifyBrevoError(err);
    // Jamais la clé ni le contenu du message : seulement la cause et l'action à mener.
    logger.error('Erreur envoi email Brevo', {
      kind: failure.kind,
      status: failure.status,
      hint: EMAIL_FAILURE_HINTS[failure.kind],
      providerMessage: failure.providerMessage,
      detail: failure.detail,
      to: maskEmail(payload.to),
      subject: payload.subject,
    });
    return false;
  }
}

// ─── Templates HTML ────────────────────────────────────────

const BASE_STYLE = `
  font-family: 'Segoe UI', Arial, sans-serif;
  background: #f9fafb;
  padding: 32px 16px;
`;

const CARD_STYLE = `
  max-width: 480px;
  margin: 0 auto;
  background: #ffffff;
  border-radius: 16px;
  padding: 32px;
  border: 1px solid #e5e7eb;
`;

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BASE_STYLE}">
  <div style="${CARD_STYLE}">
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:40px">🔧</span>
      <h1 style="color:#16a34a;font-size:24px;margin:8px 0 4px">BLA</h1>
      <p style="color:#6b7280;font-size:13px;margin:0">Services à domicile</p>
    </div>
    ${content}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0">
      © ${new Date().getFullYear()} BLA — Ne répondez pas à cet email.<br>
      Si vous n'avez pas demandé cet email, ignorez-le.
    </p>
  </div>
</body>
</html>`;
}

export const emailTemplates = {

  /** OTP d'inscription */
  otpRegister: (code: string, _phone?: string) => ({
    subject: 'Votre code de vérification BLA',
    html: baseTemplate(`
      <h2 style="color:#111827;font-size:20px;margin:0 0 12px">Vérifiez votre compte</h2>
      <p style="color:#4b5563;font-size:15px;line-height:1.6">
        Bienvenue sur BLA ! Utilisez ce code pour activer votre compte :
      </p>
      <div style="background:#f0fdf4;border:2px dashed #22c55e;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
        <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#15803d">${code}</span>
      </div>
      <p style="color:#6b7280;font-size:13px">
        ⏱ Ce code expire dans <strong>10 minutes</strong>.<br>
        🔒 Ne le partagez jamais — BLA ne vous le demandera jamais par téléphone.
      </p>
    `),
  }),

  /** OTP de connexion (MFA) */
  otpLogin: (code: string) => ({
    subject: 'Votre code de connexion BLA',
    html: baseTemplate(`
      <h2 style="color:#111827;font-size:20px;margin:0 0 12px">Connexion à votre compte</h2>
      <p style="color:#4b5563;font-size:15px">Votre code de connexion :</p>
      <div style="background:#eff6ff;border:2px dashed #3b82f6;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
        <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#1d4ed8">${code}</span>
      </div>
      <p style="color:#6b7280;font-size:13px">
        ⏱ Expire dans <strong>10 minutes</strong>.<br>
        ⚠️ Si vous n'avez pas tenté de vous connecter,
        <a href="#" style="color:#dc2626">changez votre mot de passe immédiatement</a>.
      </p>
    `),
  }),

  /** Réinitialisation de mot de passe */
  otpPasswordReset: (code: string) => ({
    subject: 'Réinitialisation de votre mot de passe BLA',
    html: baseTemplate(`
      <h2 style="color:#111827;font-size:20px;margin:0 0 12px">Mot de passe oublié ?</h2>
      <p style="color:#4b5563;font-size:15px">Utilisez ce code pour créer un nouveau mot de passe :</p>
      <div style="background:#fef3c7;border:2px dashed #f59e0b;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
        <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#92400e">${code}</span>
      </div>
      <p style="color:#6b7280;font-size:13px">⏱ Expire dans <strong>10 minutes</strong>.</p>
    `),
  }),

  /** Réservation acceptée (client) */
  bookingAccepted: (providerName: string, scheduledAt?: Date) => ({
    subject: `✅ Votre réservation a été acceptée — BLA`,
    html: baseTemplate(`
      <h2 style="color:#111827;font-size:20px;margin:0 0 12px">Bonne nouvelle !</h2>
      <p style="color:#4b5563;font-size:15px;line-height:1.6">
        <strong>${providerName}</strong> a accepté votre réservation.
        ${scheduledAt ? `<br>Rendez-vous prévu le <strong>${scheduledAt.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' })}</strong>.` : ''}
      </p>
      <p style="color:#4b5563;font-size:14px;margin-top:16px">
        📱 Suivez votre prestataire en temps réel dans l'application BLA.
      </p>
    `),
  }),

  /** Paiement confirmé */
  paymentConfirmed: (amount: number, currency: string, providerName: string) => ({
    subject: `💰 Paiement confirmé — ${amount.toLocaleString('fr-SN')} ${currency}`,
    html: baseTemplate(`
      <h2 style="color:#111827;font-size:20px;margin:0 0 12px">Paiement confirmé</h2>
      <div style="background:#f0fdf4;border-radius:12px;padding:20px;margin:16px 0">
        <table style="width:100%;font-size:14px;color:#374151">
          <tr><td>Montant payé</td><td style="text-align:right;font-weight:700">${amount.toLocaleString('fr-SN')} ${currency}</td></tr>
          <tr><td>Prestataire</td><td style="text-align:right">${providerName}</td></tr>
          <tr><td>Date</td><td style="text-align:right">${new Date().toLocaleDateString('fr-FR')}</td></tr>
        </table>
      </div>
      <p style="color:#6b7280;font-size:13px">Conservez cet email comme reçu de paiement.</p>
    `),
  }),

  /** Identité validée par l'admin */
  identityVerified: (firstName: string) => ({
    subject: '✅ Votre identité a été vérifiée — BLA',
    html: baseTemplate(`
      <h2 style="color:#111827;font-size:20px;margin:0 0 12px">Identité vérifiée !</h2>
      <p style="color:#4b5563;font-size:15px;line-height:1.6">
        Bonjour <strong>${firstName}</strong>,<br><br>
        Votre pièce d'identité a été vérifiée avec succès.
        Vous pouvez maintenant accéder à toutes les fonctionnalités de BLA.
      </p>
      <div style="background:#f0fdf4;border-radius:10px;padding:16px;margin:16px 0;color:#15803d;font-size:14px">
        ✅ Profil vérifié · Paiements activés · Badge de confiance ajouté
      </div>
    `),
  }),

  /** Alerte de sécurité */
  securityAlert: (firstName: string, city: string, device: string) => ({
    subject: '⚠️ Connexion depuis un nouvel appareil — BLA',
    html: baseTemplate(`
      <h2 style="color:#dc2626;font-size:20px;margin:0 0 12px">⚠️ Alerte de sécurité</h2>
      <p style="color:#4b5563;font-size:15px;line-height:1.6">
        Bonjour <strong>${firstName}</strong>,<br><br>
        Une connexion a été effectuée depuis un nouvel appareil :
      </p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:16px 0;font-size:14px;color:#374151">
        📍 Localisation : <strong>${city}</strong><br>
        💻 Appareil : <strong>${device}</strong><br>
        🕐 Date : <strong>${new Date().toLocaleString('fr-FR')}</strong>
      </div>
      <p style="color:#4b5563;font-size:14px">
        Si c'était vous, ignorez ce message.<br>
        Sinon, <a href="${process.env.APP_URL}/reset-password" style="color:#dc2626;font-weight:700">changez votre mot de passe immédiatement</a>.
      </p>
    `),
  }),
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
