import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';

const REASONS = ['fraud', 'fake_profile', 'no_show', 'harassment', 'inappropriate', 'other'] as const;

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  reportedId: string;
  reportedName: string;
  bookingId?: string;
}

/** Signalement d'un utilisateur à l'équipe de modération. */
export function ReportDialog({ open, onClose, reportedId, reportedName, bookingId }: ReportDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('fraud');
  const [description, setDescription] = useState('');
  const send = useMutation({
    mutationFn: () => api.post('/reports', {
      reportedId,
      reason,
      ...(bookingId ? { bookingId } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    }).then((r) => r.data),
  });

  const close = () => {
    send.reset();
    setDescription('');
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={t('report.title', { name: reportedName })} description={t('report.intro')}>
      {send.isSuccess ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-green-700 dark:text-green-400">{send.data?.message ?? t('report.sent')}</p>
          <button type="button" onClick={close} className="w-full rounded-xl bg-green-700 py-2.5 text-sm font-semibold text-white hover:bg-green-800">{t('common.close')}</button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="space-y-3">
          <div>
            <label htmlFor="report-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('report.reason')}</label>
            <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500">
              {REASONS.map((r) => <option key={r} value={r}>{t(`report.reason_${r}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="report-description" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('report.details')}</label>
            <textarea id="report-description" rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          {send.isError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{getApiErrorMessage(send.error)}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={close} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200">{t('common.back')}</button>
            <button type="submit" disabled={send.isPending} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {send.isPending ? t('common.sending') : t('common.send')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
