const createMany = jest.fn();
const findMany = jest.fn();
jest.mock('../../src/config/database', () => ({
  prisma: { notification: { createMany }, user: { findMany } },
}));
jest.mock('../../src/config/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import { notifyStaff, notifyUser, notifyUsers } from '../../src/modules/notifications/notifications.service';
import { logger } from '../../src/config/logger';

describe('service de notifications', () => {
  beforeEach(() => {
    createMany.mockReset().mockImplementation(({ data }) => Promise.resolve({ count: data.length }));
    findMany.mockReset();
  });

  it('dédoublonne les destinataires et ignore les valeurs vides', async () => {
    const count = await notifyUsers(['a', 'a', null, undefined, 'b'], { type: 'booking.created', title: 'T' });
    expect(count).toBe(2);
    expect(createMany.mock.calls[0][0].data.map((r: { userId: string }) => r.userId)).toEqual(['a', 'b']);
  });

  it('lien interne uniquement : URL externe ou « // » écartées', async () => {
    await notifyUser('a', { type: 'booking.created', title: 'T', link: '/bookings/1' });
    await notifyUser('a', { type: 'booking.created', title: 'T', link: 'https://evil.example' });
    await notifyUser('a', { type: 'booking.created', title: 'T', link: '//evil.example' });
    const links = createMany.mock.calls.map((c) => c[0].data[0].data.link);
    expect(links).toEqual(['/bookings/1', undefined, undefined]);
  });

  it('tronque titre et corps', async () => {
    await notifyUser('a', { type: 'booking.created', title: 'x'.repeat(500), body: 'y'.repeat(5000) });
    const row = createMany.mock.calls[0][0].data[0];
    expect(row.title).toHaveLength(200);
    expect(row.body).toHaveLength(1000);
  });

  it('ne fait jamais échouer l\'action métier', async () => {
    createMany.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(notifyUser('a', { type: 'booking.created', title: 'T' })).resolves.toBe(0);
    expect(logger.error).toHaveBeenCalled();
  });

  it('équipe : super-admin + détenteurs de la permission uniquement', async () => {
    findMany.mockResolvedValue([
      { id: 'sa', role: 'super_admin', permissions: [] },
      { id: 'sup', role: 'admin', permissions: ['reports.handle'] },
      { id: 'mod', role: 'admin', permissions: ['reviews.moderate'] },
      { id: 'bad', role: 'admin', permissions: 'reports.handle' },
    ]);
    const count = await notifyStaff('reports.handle', { type: 'report.created', title: 'T' });
    expect(count).toBe(2);
    expect(createMany.mock.calls[0][0].data.map((r: { userId: string }) => r.userId)).toEqual(['sa', 'sup']);
  });
});
