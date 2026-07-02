import { Request, Response } from 'express';
import { payoutsService } from './payouts.service';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import { auditFromReq } from '../../utils/audit.util';
import { logger } from '../../config/logger';
import type { RequestPayoutInput, ProcessPayoutInput } from './payouts.schemas';

type HttpErr = { status?: number; message?: string };

export const payoutsController = {
  // ─── Prestataire ─────────────────────────────────────────
  async myBalance(req: Request, res: Response) {
    try {
      return res.json(await payoutsService.getBalance(req.user!.id));
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async requestMine(req: Request, res: Response) {
    const body = req.body as RequestPayoutInput;
    try {
      const payout = await payoutsService.requestPayout(req.user!.id, body.method, body.destination);
      await auditFromReq(req, 'payout.request', { entity: 'payout', entityId: payout.id, newData: { amount: Number(payout.amount) } });
      return res.status(201).json({ message: 'Demande de retrait enregistrée.', payout });
    } catch (err) {
      const e = err as HttpErr;
      return res.status(e.status ?? 500).json({ error: e.message ?? 'Erreur serveur' });
    }
  },

  async listMine(req: Request, res: Response) {
    try {
      return res.json({ data: await payoutsService.listProviderPayouts(req.user!.id) });
    } catch {
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // ─── Admin ───────────────────────────────────────────────
  async adminList(req: Request, res: Response) {
    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const where = status ? { status } : {};
    try {
      const [rows, total] = await payoutsService.listAllPayouts(where, getSkip({ page, limit }), limit);
      return res.json(paginate(rows, total, { page, limit }));
    } catch (err) {
      logger.error('Erreur liste payouts', err);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  async adminProcess(req: Request, res: Response) {
    const body = req.body as ProcessPayoutInput;
    try {
      const result = await payoutsService.processPayout(req.params.id, req.user!.id, body.action, body.reference);
      await auditFromReq(req, `payout.${body.action}`, { entity: 'payout', entityId: req.params.id });
      return res.json({ message: 'Retrait mis à jour', ...result });
    } catch (err) {
      const e = err as HttpErr;
      return res.status(e.status ?? 500).json({ error: e.message ?? 'Erreur serveur' });
    }
  },

  async adminRefund(req: Request, res: Response) {
    try {
      const result = await payoutsService.refundTransaction(req.params.id);
      await auditFromReq(req, 'transaction.refund', { entity: 'transaction', entityId: req.params.id });
      return res.json({ message: 'Paiement remboursé', ...result });
    } catch (err) {
      const e = err as HttpErr;
      return res.status(e.status ?? 500).json({ error: e.message ?? 'Erreur serveur' });
    }
  },
};
