import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

interface Trends {
  metrics: Array<{ key: 'signups' | 'bookings' | 'revenue'; current: number; previous: number; deltaPercent: number | null }>;
  daily: Array<{ day: string; signups: number; bookings: number }>;
  currency: string;
}

const LABELS = { signups: 'Inscriptions', bookings: 'Réservations', revenue: 'Paiements encaissés' } as const;

function formatValue(key: string, v: number, currency: string) {
  return key === 'revenue' ? `${v.toLocaleString('fr-FR')} ${currency}` : v.toLocaleString('fr-FR');
}

/**
 * Évolutions RÉELLES calculées par le serveur : mois en cours (jusqu'à aujourd'hui) contre
 * la même période du mois précédent. Sans période de référence, aucune variation n'est affichée.
 */
export default function TrendsPanel() {
  const { data, isLoading, isError } = useQuery<Trends>({
    queryKey: ['admin-trends'],
    queryFn: () => api.get('/admin/dashboard/trends').then((r) => r.data),
    staleTime: 60_000,
  });
  if (isLoading) return <div className="h-40 animate-pulse rounded-2xl border border-white/[0.08] bg-[#1a2744]" />;
  if (isError || !data || !Array.isArray(data.metrics) || !Array.isArray(data.daily)) return null;
  const max = Math.max(1, ...data.daily.map((d) => d.bookings + d.signups));

  return (
    <section aria-labelledby="trends-title" className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#1a2744] p-5">
      <div>
        <h2 id="trends-title" className="text-sm font-semibold text-white">Évolution du mois</h2>
        <p className="text-xs text-gray-400">Mois en cours comparé à la même période du mois précédent.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.metrics.map((m) => (
          <div key={m.key} className="rounded-xl bg-white/5 p-3" data-testid={`trend-${m.key}`}>
            <p className="text-xs text-gray-400">{LABELS[m.key]}</p>
            <p className="text-lg font-bold text-white">{formatValue(m.key, m.current, data.currency)}</p>
            <p className="text-xs text-gray-400">
              {m.deltaPercent === null
                ? 'Pas de référence le mois précédent'
                : <><span className={m.deltaPercent >= 0 ? 'text-green-400' : 'text-red-400'}>{m.deltaPercent >= 0 ? '+' : ''}{m.deltaPercent.toLocaleString('fr-FR')} %</span> (contre {formatValue(m.key, m.previous, data.currency)})</>}
            </p>
          </div>
        ))}
      </div>
      <figure>
        <figcaption className="mb-2 text-xs text-gray-400">Activité quotidienne, 30 derniers jours (inscriptions et réservations)</figcaption>
        <div className="flex h-24 items-end gap-[2px]" aria-hidden="true">
          {data.daily.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col justify-end" title={`${new Date(d.day).toLocaleDateString('fr-FR')} : ${d.signups} inscription(s), ${d.bookings} réservation(s)`}>
              <div className="bg-green-500/80" style={{ height: `${(d.bookings / max) * 100}%` }} />
              <div className="bg-blue-500/70" style={{ height: `${(d.signups / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <p className="mt-1 flex gap-4 text-[11px] text-gray-400">
          <span><span className="mr-1 inline-block h-2 w-2 bg-green-500" aria-hidden="true" />Réservations</span>
          <span><span className="mr-1 inline-block h-2 w-2 bg-blue-500" aria-hidden="true" />Inscriptions</span>
        </p>
        {/* Équivalent textuel pour les lecteurs d'écran */}
        <table className="sr-only">
          <caption>Activité quotidienne</caption>
          <thead><tr><th scope="col">Jour</th><th scope="col">Inscriptions</th><th scope="col">Réservations</th></tr></thead>
          <tbody>{data.daily.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.signups}</td><td>{d.bookings}</td></tr>)}</tbody>
        </table>
      </figure>
    </section>
  );
}
