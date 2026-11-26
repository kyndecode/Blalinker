import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Modal } from '../common/Modal';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';

const REASONS: Array<{ value: string; label: string }> = [
  { value: 'fraud', label: 'Fraude ou arnaque' },
  { value: 'fake_profile', label: 'Faux profil' },
  { value: 'no_show', label: 'Absence au rendez-vous' },
  { value: 'harassment', label: 'Harcèlement' },
  { value: 'inappropriate', label: 'Contenu ou comportement inapproprié' },
  { value: 'other', label: 'Autre' },
];

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  reportedId: string;
  reportedName: string;
  bookingId?: string;
}

/** Signalement d'un utilisateur à l'équipe de modération. */
export function ReportDialog({ open, onClose, reportedId, reportedName, bookingId }: ReportDialogProps) {
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
    <Modal open={open} onClose={close} title={`Signaler ${reportedName}`} description="Notre équipe examine chaque signalement. La personne signalée n'est pas informée de votre identité.">
      {send.isSuccess ? (
        <div className="space-y-4">
          <p role="status" className="text-sm text-green-700 dark:text-green-400">{send.data?.message ?? 'Signalement envoyé.'}</p>
          <button type="button" onClick={close} className="w-full rounded-xl bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700">Fermer</button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }} className="space-y-3">
          <div>
            <label htmlFor="report-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Motif</label>
            <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500">
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="report-description" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Précisions (facultatif)</label>
            <textarea id="report-description" rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          {send.isError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{getApiErrorMessage(send.error)}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={close} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200">Retour</button>
            <button type="submit" disabled={send.isPending} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {send.isPending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
