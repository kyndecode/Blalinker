import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { sendEmail } from '../../config/email';
import { getPaginationParams, getSkip, paginate } from '../../utils/pagination.util';
import type { CreateContactInput } from './contact.schemas';

type ContactRequestRecord = {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  countryCode: string;
  subject: string;
  message: string;
  status: 'new' | 'read' | 'answered' | 'done' | 'closed';
  adminResponse: string | null;
  handledBy: string | null;
  handledAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ContactRequestDelegate = {
  create: (args?: unknown) => Promise<ContactRequestRecord>;
  findMany: (args?: unknown) => Promise<ContactRequestRecord[]>;
  count: (args?: unknown) => Promise<number>;
};

const contactRequestModel = (
  prisma as unknown as { contactRequest: ContactRequestDelegate }
).contactRequest;

const SUBJECT_LABELS: Record<string, string> = {
  support_account: 'Compte utilisateur',
  support_booking: 'Réservation / Prestation',
  support_payment: 'Paiement',
  provider_partnership: 'Devenir prestataire / Partenariat',
  security_report: 'Sécurité / Signalement',
  other: 'Autre demande',
};

function getSubjectLabel(subject: string): string {
  return SUBJECT_LABELS[subject] ?? subject;
}

async function sendRequesterAcknowledgement(payload: CreateContactInput, requestId: string): Promise<void> {
  await sendEmail({
    to: payload.email,
    subject: `BLA Services - Demande reçue (${getSubjectLabel(payload.subject)})`,
    html: `
      <p>Bonjour <strong>${payload.firstName}</strong>,</p>
      <p>Nous avons bien reçu votre message. Notre équipe va vous répondre rapidement.</p>
      <p><strong>Référence:</strong> ${requestId}</p>
      <p><strong>Sujet:</strong> ${getSubjectLabel(payload.subject)}</p>
      <p>Vous recevrez une notification dès qu'un admin aura traité votre demande.</p>
      <p>Merci de votre confiance,<br/>L'équipe BLA Services</p>
    `,
  });
}

async function notifyAdmins(payload: CreateContactInput, requestId: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['admin', 'super_admin'] },
      status: 'active',
      deletedAt: null,
    },
    select: { id: true, email: true },
  });

  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: 'contact_request',
        title: 'Nouveau message contact',
        body: `${payload.firstName} ${payload.lastName} (${payload.email}) - ${getSubjectLabel(payload.subject)}`,
        data: {
          requestId,
          subject: payload.subject,
          email: payload.email,
          phone: payload.phone,
        },
      })),
    });
  }

  const adminMailbox = env.ADMIN_EMAIL;
  if (adminMailbox) {
    await sendEmail({
      to: adminMailbox,
      subject: `BLA Admin - Nouveau contact (${getSubjectLabel(payload.subject)})`,
      html: `
        <p>Nouveau message contact reçu.</p>
        <p><strong>Référence:</strong> ${requestId}</p>
        <p><strong>Nom:</strong> ${payload.firstName} ${payload.lastName}</p>
        <p><strong>Email:</strong> ${payload.email}</p>
        <p><strong>Téléphone:</strong> ${payload.phone}</p>
        <p><strong>Sujet:</strong> ${getSubjectLabel(payload.subject)}</p>
        <p><strong>Message:</strong><br/>${payload.message.replace(/\n/g, '<br/>')}</p>
      `,
    });
  }
}

async function createContactRequest(payload: CreateContactInput, userId?: string): Promise<string> {
  const created = await contactRequestModel.create({
    data: {
      userId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
      countryCode: payload.countryCode,
      subject: payload.subject,
      message: payload.message,
      status: 'new',
    },
    select: { id: true },
  });

  await Promise.all([
    sendRequesterAcknowledgement(payload, created.id),
    notifyAdmins(payload, created.id),
  ]);

  return created.id;
}

export const contactController = {
  async createPublic(req: Request, res: Response) {
    try {
      const requestId = await createContactRequest(req.body as CreateContactInput);
      return res.status(201).json({
        message: 'Votre demande a bien été enregistrée. Nous revenons vers vous très vite.',
        requestId,
      });
    } catch (error) {
      logger.error('Erreur création contact (public):', error);
      return res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
    }
  },

  async createAuthenticated(req: Request, res: Response) {
    try {
      const requestId = await createContactRequest(req.body as CreateContactInput, req.user?.id);
      return res.status(201).json({
        message: 'Votre demande a bien été enregistrée. Nous revenons vers vous très vite.',
        requestId,
      });
    } catch (error) {
      logger.error('Erreur création contact (auth):', error);
      return res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
    }
  },

  async listMine(req: Request, res: Response) {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const { page, limit } = getPaginationParams(req.query as Record<string, unknown>);

    try {
      const where = { userId: req.user.id };
      const [rows, total] = await Promise.all([
        contactRequestModel.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: getSkip({ page, limit }),
          take: limit,
        }),
        contactRequestModel.count({ where }),
      ]);

      return res.json(paginate(rows, total, { page, limit }));
    } catch (error) {
      logger.error('Erreur liste mes contacts:', error);
      return res.status(500).json({ error: 'Erreur serveur' });
    }
  },
};

export const contactLabels = {
  subject: getSubjectLabel,
};

