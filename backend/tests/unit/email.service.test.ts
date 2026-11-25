/**
 * Service e-mail Brevo : causes d'échec identifiées, délai d'attente,
 * expéditeur, et journaux sans secret ni adresse complète.
 * axios est simulé : aucun appel réel à Brevo.
 */
jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'production',
    BREVO_API_KEY: 'cle-factice-de-test',
    BREVO_FROM_EMAIL: 'contact@blalinker.com',
    BREVO_FROM_NAME: 'BLA Services',
  },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

import axios from 'axios';
import { logger } from '../../src/config/logger';
import { classifyBrevoError, sendEmail, BREVO_TIMEOUT_MS } from '../../src/config/email';

const post = axios.post as jest.Mock;
const RECIPIENT = 'jean.dupont@gmail.com';
const IP_MESSAGE =
  'We have detected you are using an unrecognised IP address 74.220.51.139. If you performed this action make sure to add the new IP address in this link: https://app.brevo.com/security/authorised_ips';

const httpError = (status: number, data: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

beforeEach(() => jest.clearAllMocks());

describe('classifyBrevoError', () => {
  it.each([
    [httpError(401, { code: 'unauthorized', message: IP_MESSAGE }), 'ip_not_authorized'],
    [httpError(401, { code: 'unauthorized', message: 'Key not found' }), 'invalid_api_key'],
    [httpError(400, { code: 'invalid_parameter', message: 'Sender is not valid' }), 'invalid_sender'],
    [httpError(402, { code: 'not_enough_credits', message: 'Not enough credits' }), 'insufficient_credits'],
    [httpError(429, { message: 'Too many requests' }), 'rate_limited'],
    [httpError(503, {}), 'provider_error'],
    [httpError(400, { message: 'Invalid email address' }), 'rejected'],
    [Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }), 'timeout'],
    [new Error('getaddrinfo ENOTFOUND'), 'network'],
  ])('cas %#', (err, kind) => {
    expect(classifyBrevoError(err).kind).toBe(kind);
  });
});

describe('sendEmail', () => {
  const payload = { to: RECIPIENT, subject: 'Code de connexion', html: '<p>Votre code : 123456</p>' };

  it('envoie via Brevo avec l’expéditeur contact@blalinker.com et un délai de 10 s', async () => {
    post.mockResolvedValue({ data: { messageId: 'x' } });

    await expect(sendEmail(payload)).resolves.toBe(true);

    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(body.sender).toEqual({ email: 'contact@blalinker.com', name: 'BLA Services' });
    expect(config.timeout).toBe(BREVO_TIMEOUT_MS);
    expect(BREVO_TIMEOUT_MS).toBe(10_000);
    expect(logger.info).toHaveBeenCalledWith('Email envoyé', expect.objectContaining({ to: 'je***@gmail.com', subject: 'Code de connexion', durationMs: expect.any(Number) }));
  });

  it('IP refusée par Brevo : false, cause et action journalisées, sans clé ni adresse ni contenu', async () => {
    post.mockRejectedValue(httpError(401, { code: 'unauthorized', message: IP_MESSAGE }));

    await expect(sendEmail(payload)).resolves.toBe(false);

    expect(logger.error).toHaveBeenCalledWith(
      'Erreur envoi email Brevo',
      expect.objectContaining({ kind: 'ip_not_authorized', status: 401, to: 'je***@gmail.com' }),
    );
    const logs = JSON.stringify((logger.error as jest.Mock).mock.calls);
    expect(logs).toContain('Authorized IPs');
    expect(logs).not.toContain('cle-factice-de-test');
    expect(logs).not.toContain(RECIPIENT);
    expect(logs).not.toContain('123456');
  });
});
