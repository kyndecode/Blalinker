import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatLocale } from '../../utils/locale';
import api from '../../services/api';

export interface AppNotification {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  data: { link?: string; bookingId?: string } | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationList {
  data: AppNotification[];
  meta: { page: number; totalPages: number; total: number };
  unreadCount: number;
}

export function fetchNotifications(page = 1, limit = 10): Promise<NotificationList> {
  return api.get('/notifications', { params: { page, limit } }).then((r) => r.data);
}

/** Lien interne uniquement (les liens externes sont ignorés). */
export function notificationLink(n: AppNotification): string | null {
  const link = n.data?.link;
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//') ? link : null;
}

export function formatNotificationDate(value: string, t: TFunction, language?: string): string {
  const d = new Date(value);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return t('notifications.just_now');
  if (diffMin < 60) return t('notifications.minutes_ago', { count: diffMin });
  if (diffMin < 24 * 60) return t('notifications.hours_ago', { count: Math.round(diffMin / 60) });
  return d.toLocaleDateString(formatLocale(language), { day: 'numeric', month: 'short' });
}

/** Cloche de l'en-tête : nombre de non-lues (actualisé chaque minute) et 8 dernières notifications. */
export default function NotificationBell({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => fetchNotifications(1, 8),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const unread = data?.unreadCount ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openNotification = (n: AppNotification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    const link = notificationLink(n);
    if (link) navigate(link);
  };

  const label = unread > 0 ? t('notifications.bell_unread', { count: unread }) : t('notifications.title');

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-700 text-[10px] font-bold text-white flex items-center justify-center" data-testid="unread-badge">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="region"
          aria-label={t('notifications.latest')}
          className={`absolute ${variant === 'mobile' ? '-right-20' : 'right-0'} top-11 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-50`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('notifications.title')}</p>
            {unread > 0 && (
              <button onClick={() => markAll.mutate()} className="text-xs text-green-700 dark:text-green-400 hover:underline">
                {t('notifications.mark_all')}
              </button>
            )}
          </div>
          {(data?.data.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400">{t('notifications.empty_short')}</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {data!.data.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openNotification(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${n.isRead ? '' : 'bg-green-50/60 dark:bg-green-900/10'}`}
                  >
                    <p className={`text-sm ${n.isRead ? 'text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white'}`}>
                      {!n.isRead && <span className="sr-only">{t('notifications.unread_prefix')}</span>}{n.title ?? t('notifications.fallback_title')}
                    </p>
                    {n.body && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{formatNotificationDate(n.createdAt, t, i18n.language)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/notifications" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-center text-sm text-green-700 dark:text-green-400 border-t border-gray-100 dark:border-gray-700 hover:underline">
            {t('notifications.see_all')}
          </Link>
        </div>
      )}
    </div>
  );
}
