import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  Users, Briefcase, CalendarCheck, DollarSign,
  AlertTriangle, Clock, TrendingUp, ShieldCheck,
  ArrowUpRight, ArrowDownRight, Activity
} from 'lucide-react';

interface DashboardStats {
  users:     { total: number; active: number; pendingVerification: number; newThisWeek: number };
  providers: { total: number; active: number; pendingApproval: number };
  bookings:  { total: number; today: number; inProgress: number; completed: number };
  revenue:   { total: number; thisMonth: number; currency: string };
  reports:   { open: number };
  reviews:   { pending: number };
}

function StatCard({ icon: Icon, label, value, sub, color, trend }: {
  icon: React.ElementType; label: string; value: number | string;
  sub?: string; color: string; trend?: number;
}) {
  return (
    <div className="bg-[#1a2744] rounded-2xl p-5 border border-white/[0.08] hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        {trend !== undefined && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-extrabold text-white mb-1">{value}</p>
      <p className="text-gray-400 text-xs font-medium">{label}</p>
      {sub && <p className="text-gray-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ['admin-dashboard'],
    queryFn:  () => api.get('/admin/dashboard').then((r) => r.data),
    refetchInterval: 60_000,
  });

  const now = new Date();
  const h = now.getHours();
  const greeting = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';

  return (
    <div className="space-y-8">

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white">{greeting} 👋</h1>
          <p className="text-gray-500 text-sm mt-1">
            {now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#1a2744] border border-white/[0.08] rounded-xl px-4 py-2 w-fit">
          <Activity className="w-4 h-4 text-green-400" />
          <span className="text-xs text-gray-400">Mise à jour toutes les 60s</span>
        </div>
      </div>

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-[#1a2744] rounded-2xl p-5 h-32 animate-pulse border border-white/[0.08]" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Users}         label="Utilisateurs"         value={data.users.total}
              sub={`${data.users.active} actifs · +${data.users.newThisWeek}/sem`} color="bg-blue-600"    trend={12} />
            <StatCard icon={ShieldCheck}   label="Vérifications KYC"    value={data.users.pendingVerification}
              sub="Identités à valider"                                   color="bg-amber-500"   trend={-3} />
            <StatCard icon={Briefcase}     label="Prestataires"         value={data.providers.total}
              sub={`${data.providers.pendingApproval} en attente approbation`} color="bg-purple-600"  trend={8}  />
            <StatCard icon={CalendarCheck} label="Réservations"         value={data.bookings.total}
              sub={`${data.bookings.today} aujourd'hui`}                  color="bg-green-600"   trend={15} />
            <StatCard icon={Clock}         label="Missions en cours"    value={data.bookings.inProgress}
              sub="Temps réel"                                            color="bg-orange-600"  />
            <StatCard icon={DollarSign}    label="Revenus du mois"      value={`${data.revenue.thisMonth.toLocaleString()} ${data.revenue.currency}`}
              sub={`Commission: ${Math.round(data.revenue.thisMonth * 0.05).toLocaleString()}`} color="bg-emerald-600" trend={22} />
            <StatCard icon={AlertTriangle} label="Signalements"         value={data.reports.open}
              sub="À traiter en priorité"                                 color="bg-red-600"     />
            <StatCard icon={TrendingUp}    label="Avis à modérer"       value={data.reviews.pending}
              sub="En attente de validation"                              color="bg-indigo-600"  />
          </div>

          {/* Détails */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Réservations */}
            <div className="bg-[#1a2744] rounded-2xl p-5 border border-white/[0.08]">
              <h3 className="text-white font-semibold text-sm mb-5">Répartition réservations</h3>
              <div className="space-y-4">
                {[
                  { label: 'En cours',    value: data.bookings.inProgress, max: data.bookings.total, color: 'bg-orange-500' },
                  { label: 'Terminées',   value: data.bookings.completed,  max: data.bookings.total, color: 'bg-green-500'  },
                  { label: "Aujourd'hui", value: data.bookings.today,      max: data.bookings.total, color: 'bg-blue-500'   },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-400">{row.label}</span>
                      <span className="text-white font-semibold">{row.value}</span>
                    </div>
                    <MiniBar value={row.value} max={row.max} color={row.color} />
                  </div>
                ))}
              </div>
            </div>

            {/* Utilisateurs */}
            <div className="bg-[#1a2744] rounded-2xl p-5 border border-white/[0.08]">
              <h3 className="text-white font-semibold text-sm mb-5">Répartition utilisateurs</h3>
              <div className="space-y-4">
                {[
                  { label: 'Actifs',            value: data.users.active,              max: data.users.total, color: 'bg-green-500' },
                  { label: 'En attente vérif.',  value: data.users.pendingVerification, max: data.users.total, color: 'bg-amber-500' },
                  { label: 'Nouveaux cette sem', value: data.users.newThisWeek,         max: data.users.total, color: 'bg-blue-500'  },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-gray-400">{row.label}</span>
                      <span className="text-white font-semibold">{row.value}</span>
                    </div>
                    <MiniBar value={row.value} max={row.max} color={row.color} />
                  </div>
                ))}
              </div>
            </div>

            {/* Finances */}
            <div className="bg-[#1a2744] rounded-2xl p-5 border border-white/[0.08]">
              <h3 className="text-white font-semibold text-sm mb-5">Finances</h3>
              <div className="space-y-5">
                <div>
                  <p className="text-gray-500 text-xs mb-1">Revenus ce mois</p>
                  <p className="text-3xl font-extrabold text-white">{data.revenue.thisMonth.toLocaleString()}</p>
                  <p className="text-gray-500 text-xs">{data.revenue.currency}</p>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-gray-500 text-xs mb-1">Revenus cumulés</p>
                  <p className="text-xl font-bold text-green-400">{data.revenue.total.toLocaleString()} {data.revenue.currency}</p>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-gray-500 text-xs mb-1">Commission plateforme (5%)</p>
                  <p className="text-xl font-bold text-amber-400">{Math.round(data.revenue.thisMonth * 0.05).toLocaleString()} {data.revenue.currency}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-[#1a2744] rounded-2xl p-8 border border-white/[0.08] text-center">
          <p className="text-gray-500 text-sm">Données non disponibles. Vérifiez la connexion API.</p>
        </div>
      )}
    </div>
  );
}
