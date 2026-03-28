// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV:              'test',
    APP_URL:               'http://localhost:3000',
    CINETPAY_API_KEY:      'test-api-key',
    CINETPAY_SITE_ID:      '123456',
    CINETPAY_NOTIFY_URL:   'http://localhost:3000/api/v1/payments/webhook/cinetpay',
    CINETPAY_RETURN_URL:   'http://localhost:3000/payment/success',
    STRIPE_SECRET_KEY:     'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_fake',
    STRIPE_PUBLIC_KEY:     'pk_test_fake',
  },
}));

jest.mock('../../src/config/database', () => ({
  prisma: {
    booking:     { findFirst: jest.fn(), update: jest.fn() },
    transaction: {
      create:      jest.fn(),
      findFirst:   jest.fn(),
      update:      jest.fn(),
      updateMany:  jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('axios');

jest.mock('stripe', () => {
  const mockStripe = {
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };
  return jest.fn(() => mockStripe);
});

// ─── Imports ───────────────────────────────────────────────────────────────────
import axios                from 'axios';
import { prisma }           from '../../src/config/database';
import { PaymentService }   from '../../src/modules/payments/payments.service';

const paymentService = new PaymentService();

const mockBooking     = prisma.booking     as jest.Mocked<typeof prisma.booking>;
const mockTransaction = prisma.transaction as jest.Mocked<typeof prisma.transaction>;
const mockAxios       = axios              as jest.Mocked<typeof axios>;

// ─── Données de test ───────────────────────────────────────────────────────────
const BOOKING_ID     = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID        = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROVIDER_ID    = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TRANSACTION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const EXT_REF        = `BLA-${BOOKING_ID.slice(0, 8)}-1234567890`;

const fakeBooking = {
  id:         BOOKING_ID,
  clientId:   USER_ID,
  providerId: PROVIDER_ID,
  amount:     15000,
  currency:   'XOF',
  status:     'pending' as const,
};

const fakeTransaction = {
  id:          TRANSACTION_ID,
  bookingId:   BOOKING_ID,
  payerId:     USER_ID,
  payeeId:     PROVIDER_ID,
  amount:      15000,
  netAmount:   15000,
  currency:    'XOF',
  method:      'wave' as const,
  status:      'pending' as const,
  externalRef: EXT_REF,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PaymentService', () => {

  beforeEach(() => jest.clearAllMocks());

  // ─── initCinetPay() ────────────────────────────────────────
  describe('initCinetPay()', () => {
    it('retourne paymentUrl et transactionId après init réussie', async () => {
      (mockBooking.findFirst    as jest.Mock).mockResolvedValue(fakeBooking);
      (mockTransaction.create   as jest.Mock).mockResolvedValue(fakeTransaction);
      (mockAxios.post            as jest.Mock).mockResolvedValue({
        data: { code: '201', payment_token: 'tok_test', payment_url: 'https://pay.cinetpay.com/test' },
      });

      const result = await paymentService.initCinetPay(BOOKING_ID, USER_ID, 'XOF');

      expect(result).toHaveProperty('paymentUrl');
      expect(result).toHaveProperty('transactionId');
      expect(result.paymentUrl).toBe('https://pay.cinetpay.com/test');
      expect(mockTransaction.create).toHaveBeenCalledTimes(1);
    });

    it('arrondit au multiple de 5 pour XOF', async () => {
      const bookingWith3500 = { ...fakeBooking, amount: 3500 };
      (mockBooking.findFirst  as jest.Mock).mockResolvedValue(bookingWith3500);
      (mockTransaction.create as jest.Mock).mockResolvedValue(fakeTransaction);
      (mockAxios.post          as jest.Mock).mockResolvedValue({
        data: { code: '201', payment_token: 'tok_test', payment_url: 'https://pay.cinetpay.com/test' },
      });

      await paymentService.initCinetPay(BOOKING_ID, USER_ID, 'XOF');

      const createCall = (mockTransaction.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.amount % 5).toBe(0);
    });

    it('lève 404 si la réservation est introuvable', async () => {
      (mockBooking.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(paymentService.initCinetPay(BOOKING_ID, USER_ID, 'XOF'))
        .rejects.toMatchObject({ status: 404 });

      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('lève 400 si le montant de la réservation est 0', async () => {
      (mockBooking.findFirst as jest.Mock).mockResolvedValue({ ...fakeBooking, amount: 0 });

      await expect(paymentService.initCinetPay(BOOKING_ID, USER_ID, 'XOF'))
        .rejects.toMatchObject({ status: 400 });
    });

    it('lève 502 si CinetPay retourne une erreur', async () => {
      (mockBooking.findFirst as jest.Mock).mockResolvedValue(fakeBooking);
      (mockAxios.post         as jest.Mock).mockResolvedValue({
        data: { code: '500', message: 'Erreur interne CinetPay' },
      });

      await expect(paymentService.initCinetPay(BOOKING_ID, USER_ID, 'XOF'))
        .rejects.toMatchObject({ status: 502 });
    });
  });

  // ─── verifyCinetPay() ──────────────────────────────────────
  describe('verifyCinetPay()', () => {
    it('retourne status=paid si ACCEPTED', async () => {
      (mockTransaction.findFirst as jest.Mock).mockResolvedValue(fakeTransaction);
      (mockAxios.post             as jest.Mock).mockResolvedValue({
        data: { code: '00', data: { status: 'ACCEPTED' } },
      });
      (prisma.$transaction as jest.Mock).mockResolvedValue([]);

      const result = await paymentService.verifyCinetPay(EXT_REF);

      expect(result.status).toBe('paid');
    });

    it('retourne status=pending si non encore traité', async () => {
      (mockTransaction.findFirst as jest.Mock).mockResolvedValue(fakeTransaction);
      (mockAxios.post             as jest.Mock).mockResolvedValue({
        data: { code: '00', data: { status: 'PENDING' } },
      });

      const result = await paymentService.verifyCinetPay(EXT_REF);

      expect(result.status).toBe('pending');
    });

    it('lève 404 si la transaction est introuvable', async () => {
      (mockTransaction.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(paymentService.verifyCinetPay('unknown-tx'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ─── handleCinetPayWebhook() ───────────────────────────────
  describe('handleCinetPayWebhook()', () => {
    it('marque la transaction comme failed si cpm_result !== 00', async () => {
      (mockTransaction.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await paymentService.handleCinetPayWebhook({
        cpm_trans_id:      EXT_REF,
        cpm_result:        '99',
        cpm_error_message: 'Fonds insuffisants',
      });

      expect(mockTransaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'failed' } })
      );
    });

    it('confirme le paiement si cpm_result === 00', async () => {
      (mockTransaction.findFirst   as jest.Mock).mockResolvedValue(fakeTransaction);
      (prisma.$transaction          as jest.Mock).mockResolvedValue([]);

      await paymentService.handleCinetPayWebhook({
        cpm_trans_id:      EXT_REF,
        cpm_result:        '00',
        cpm_error_message: '',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('ne traite pas une transaction déjà complétée (idempotence)', async () => {
      const completedTx = { ...fakeTransaction, status: 'completed' as const };
      (mockTransaction.findFirst as jest.Mock).mockResolvedValue(completedTx);

      await paymentService.handleCinetPayWebhook({
        cpm_trans_id:      EXT_REF,
        cpm_result:        '00',
        cpm_error_message: '',
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── initStripe() ──────────────────────────────────────────
  describe('initStripe()', () => {
    it('retourne paymentUrl et transactionId', async () => {
      (mockBooking.findFirst    as jest.Mock).mockResolvedValue(fakeBooking);
      (mockTransaction.create   as jest.Mock).mockResolvedValue(fakeTransaction);

      // Mock du module stripe dynamique
      const Stripe = require('stripe');
      Stripe.mockImplementationOnce(() => ({
        checkout: {
          sessions: {
            create: jest.fn().mockResolvedValue({
              id:  'cs_test_abc123',
              url: 'https://checkout.stripe.com/pay/cs_test_abc123',
            }),
          },
        },
      }));

      const result = await paymentService.initStripe(BOOKING_ID, USER_ID, 'USD');

      expect(result).toHaveProperty('paymentUrl');
      expect(result).toHaveProperty('transactionId', 'cs_test_abc123');
    });

    it('lève 404 si la réservation est introuvable', async () => {
      (mockBooking.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(paymentService.initStripe(BOOKING_ID, USER_ID, 'USD'))
        .rejects.toMatchObject({ status: 404 });
    });

    it('lève 503 si Stripe non configuré', async () => {
      // Override env mock pour ce test
      const { env } = require('../../src/config/env');
      const originalKey = env.STRIPE_SECRET_KEY;
      env.STRIPE_SECRET_KEY = 'not_configured';

      await expect(paymentService.initStripe(BOOKING_ID, USER_ID, 'USD'))
        .rejects.toMatchObject({ status: 503 });

      env.STRIPE_SECRET_KEY = originalKey;
    });
  });
});
