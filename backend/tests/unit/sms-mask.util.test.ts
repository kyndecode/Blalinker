/**
 * Canal SMS facultatif et masquage des données personnelles.
 */
jest.mock('../../src/config/env', () => ({
  env: { NODE_ENV: 'production', TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined, TWILIO_PHONE_NUMBER: undefined },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('twilio', () => jest.fn());

import twilio from 'twilio';
import { env } from '../../src/config/env';
import { logger } from '../../src/config/logger';
import { isSmsConfigured, sendSMS } from '../../src/utils/sms.util';
import { maskEmail, maskPhone } from '../../src/utils/mask.util';

const mutableEnv = env as unknown as Record<string, string | undefined>;

describe('canal SMS (Twilio) facultatif', () => {
  afterEach(() => {
    mutableEnv.TWILIO_ACCOUNT_SID = undefined;
    mutableEnv.TWILIO_AUTH_TOKEN = undefined;
    mutableEnv.TWILIO_PHONE_NUMBER = undefined;
  });

  it('non configuré tant que les trois variables ne sont pas présentes', () => {
    expect(isSmsConfigured()).toBe(false);
    mutableEnv.TWILIO_ACCOUNT_SID = 'AC-test';
    mutableEnv.TWILIO_AUTH_TOKEN = 'token-test';
    expect(isSmsConfigured()).toBe(false); // numéro manquant
    mutableEnv.TWILIO_PHONE_NUMBER = '+15555555555';
    expect(isSmsConfigured()).toBe(true);
  });

  it("production sans configuration : aucun client Twilio, pas de message « mode dev », numéro masqué", async () => {
    // Le code reconnaît l'exécution sous Jest (JEST_WORKER_ID, NODE_ENV=test) et suit
    // alors la branche « développement » : on simule ici un vrai processus de production.
    const saved = { worker: process.env.JEST_WORKER_ID, nodeEnv: process.env.NODE_ENV };
    delete process.env.JEST_WORKER_ID;
    process.env.NODE_ENV = 'production';
    let result: boolean;
    try {
      result = await sendSMS('+33612345678', 'otp_login', ['123456']);
    } finally {
      process.env.JEST_WORKER_ID = saved.worker;
      process.env.NODE_ENV = saved.nodeEnv;
    }
    expect(result).toBe(false);

    expect(twilio).not.toHaveBeenCalled();
    const logs = JSON.stringify([
      (logger.warn as jest.Mock).mock.calls,
      (logger.debug as jest.Mock).mock.calls,
      (logger.info as jest.Mock).mock.calls,
    ]);
    expect(logs).not.toMatch(/mode dev/i);
    expect(logs).not.toContain('+33612345678');
    expect(logs).not.toContain('123456');
  });
});

describe('masquage', () => {
  it.each([
    ['kouassi.test@example.com', 'ko***@example.com'],
    ['ab@x.com', 'a***@x.com'],
    ['c@blalinker.com', 'c***@blalinker.com'],
    [null, '(aucune)'],
    ['pas-une-adresse', '***'],
  ])('maskEmail(%p) = %p', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it.each([
    ['+33612345678', '+33******678'],
    ['+221 77 123 45 67', '+22*******567'],
    ['12345', '***'],
    [undefined, '(aucun)'],
  ])('maskPhone(%p) = %p', (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });
});
