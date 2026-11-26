import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';
import {
  fetchNotifications, formatNotificationDate, notificationLink, type AppNotification,
} from '../../components/notifications/NotificationBell';

/** Historique paginé des notifications de l'utilisateur. */
export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['notifications', 'page', page],
    queryFn: () => fetchNotifications(page, 20),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const open = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    const link = notificationLink(n);
    if (link) navigate(link);
  };

  const totalPages = data?.meta.totalPages ?? 1;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('notifications.title')}</h1>
        {(data?.unreadCount ?? 0) > 0 && (
          <button onClick={() => markAll.mutate()} disabled={markAll.isPending} className="text-sm text-green-700 dark:text-green-400 hover:underline disabled:opacity-60">
            {t('notifications.mark_all_count', { count: data?.unreadCount ?? 0 })}
          </button>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-500 dark:text-gray-400" aria-busy="true">{t('common.loading')}</p>}
      {isError && <p role="alert" className="text-sm text-red-600">{getApiErrorMessage(error)}</p>}
      {data && data.data.length === 0 && (
        <p className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('notifications.empty_long')}
        </p>
      )}

      {data && data.data.length > 0 && (
        <ul className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {data.data.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className={`w-full text-left px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/40 ${n.isRead ? '' : 'bg-green-50/60 dark:bg-green-900/10'}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-sm ${n.isRead ? 'text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white'}`}>
                    {!n.isRead && <span className="sr-only">{t('notifications.unread_prefix')}</span>}{n.title ?? t('notifications.fallback_title')}
                  </p>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{formatNotificationDate(n.createdAt, t, i18n.language)}</span>
                </div>
                {n.body && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{n.body}</p>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-4 mt-6" aria-label={t('common.pagination')}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50">{t('common.previous')}</button>
          <span className="text-sm text-gray-600 dark:text-gray-300">{t('common.page_of', { page, total: totalPages })}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50">{t('common.next')}</button>
        </nav>
      )}
    </div>
  );
}
