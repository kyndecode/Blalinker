import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../common/Modal';

export interface EditableService { id: string; title: string; description?: string | null; price?: number | string | null }

const field = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500';

/** Modification d'un service du prestataire, avec validation en direct (remplace les invites du navigateur). */
export default function ServiceEditDialog({ service, busy, error, onClose, onSave }: {
  service: EditableService | null;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (v: { title: string; description?: string; price: number }) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  useEffect(() => {
    setTitle(service?.title ?? '');
    setDescription(service?.description ?? '');
    setPrice(service?.price ? String(service.price) : '');
  }, [service]);

  const priceNumber = Number(price.replace(/\s/g, '').replace(',', '.'));
  const errors = {
    title: title.trim().length < 3 ? t('service_edit.error_title') : null,
    price: !Number.isFinite(priceNumber) || priceNumber <= 0 ? t('service_edit.error_price') : null,
  };
  const valid = !errors.title && !errors.price;

  return (
    <Modal open={Boolean(service)} onClose={onClose} title={t('service_edit.title')}>
      <form
        noValidate
        onSubmit={(e) => { e.preventDefault(); if (valid) onSave({ title: title.trim(), description: description.trim() || undefined, price: priceNumber }); }}
        className="space-y-3"
      >
        <div>
          <label htmlFor="svc-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{t('service_edit.field_title')}</label>
          <input id="svc-title" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby="svc-title-err" className={field} />
          {errors.title && title.length > 0 && <p id="svc-title-err" className="mt-1 text-xs text-red-600">{errors.title}</p>}
        </div>
        <div>
          <label htmlFor="svc-desc" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{t('service_edit.field_description')}</label>
          <textarea id="svc-desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="svc-price" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{t('service_edit.field_price')}</label>
          <input id="svc-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={Boolean(errors.price)} aria-describedby="svc-price-err" className={field} />
          {errors.price && price.length > 0 && <p id="svc-price-err" className="mt-1 text-xs text-red-600">{errors.price}</p>}
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 py-2.5 text-sm">{t('common.cancel')}</button>
          <button type="submit" disabled={busy || !valid} className="flex-1 rounded-xl bg-green-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
