/**
 * Garantie : les tests ne peuvent déclencher AUCUN e-mail ni SMS réel.
 * Même avec des identifiants (factices) présents, la vraie bibliothèque axios
 * et le vrai client Twilio sont bloqués par le filet de tests/setup.ts avant
 * toute sortie réseau vers Brevo ou Twilio.
 */
jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'production',
    BREVO_API_KEY: 'xkeysib-factice-pour-le-test',
    BREVO_FROM_EMAIL: 'contact@blalinker.com',
    BREVO_FROM_NAME: 'BLA Services',
    TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
    TWILIO_AUTH_TOKEN: '00000000000000000000000000000000',
    TWILIO_PHONE_NUMBER: '+15555555555',
  },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import http from 'http';
import https from 'https';
import { logger } from '../../src/config/logger';
import { sendEmail } from '../../src/config/email';
import { sendSMS } from '../../src/utils/sms.util';

describe('aucun envoi réel pendant les tests', () => {
  it('les variables Brevo/Twilio de la machine sont neutralisées', () => {
    expect(process.env.BREVO_API_KEY).toBeUndefined();
    expect(process.env.TWILIO_ACCOUNT_SID).toBeUndefined();
    expect(process.env.TWILIO_AUTH_TOKEN).toBeUndefined();
  });

  it('une requête directe vers Brevo ou Twilio est refusée', () => {
    expect(() => https.request('https://api.brevo.com/v3/smtp/email')).toThrow(/interdit pendant les tests/);
    expect(() => https.request({ hostname: 'api.twilio.com', path: '/' })).toThrow(/interdit pendant les tests/);
    expect(() => http.get('http://api.sendinblue.com/')).toThrow(/interdit pendant les tests/);
  });

  it("sendEmail avec une clé : bloqué avant le réseau, aucun e-mail parti", async () => {
    await expect(sendEmail({ to: 'test@example.com', subject: 'Test', html: '<p>Test</p>' })).resolves.toBe(false);
    expect(logger.info).not.toHaveBeenCalledWith('Email envoyé', expect.anything());
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).toContain('interdit pendant les tests');
  });

  it('sendSMS avec des identifiants : bloqué avant le réseau, aucun SMS parti', async () => {
    await expect(sendSMS('+33600000000', 'otp_login', ['000000'])).resolves.toBe(false);
    expect(logger.info).not.toHaveBeenCalledWith('SMS envoyé', expect.anything());
  });
});
