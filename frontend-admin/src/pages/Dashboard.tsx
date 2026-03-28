import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  Users, Briefcase, CalendarCheck, DollarSign,
  AlertTriangle, Clock, TrendingUp, ShieldCheck
} from 'lucide-react';

interface DashboardStats {
  users:        { total: number; active: number; pendingVerification: number; newThisWeek: number };
  providers:    { total: number; active: number; pendingApproval: number };
  bookings:     { total: number; today: number; inProgress: number; completed: number };
  revenue:      { total: number; thisMonth: number; currency: string };
  reports:      { open: number };
  reviews:      { pending: number };
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: number | string;
  sub?: string; color: string;
}) {
  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm font-medium">{label}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ['admin-dashboard'],
    queryFn:  () => api.get('/admin/dashboard').then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-gray-800 rounded-xl p-5 h-28 animate-pulse border border-gray-700" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tableau de bord</h1>
        <p className="text-gray-400 text-sm mt-1">Vue d'ensemble de la plateforme BLA</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}        label="Utilisateurs"    value={data.users.total}
          sub={`+${data.users.newThisWeek} cette semaine`} color="bg-blue-600" />
        <StatCard icon={ShieldCheck}  label="En attente vérif." value={data.users.pendingVerification}
          sub="Identités à valider" color="bg-yellow-600" />
        <StatCard icon={Briefcase}    label="Prestataires"    value={data.providers.total}
          sub={`${data.providers.pendingApproval} en attente`} color="bg-purple-600" />
        <StatCard icon={CalendarCheck} label="Réservations"   value={data.bookings.total}
          sub={`${data.bookings.today} aujourd'hui`} color="bg-green-600" />
        <StatCard icon={Clock}        label="En cours"        value={data.bookings.inProgress}
          sub="Missions actives" color="bg-orange-600" />
        <StatCard icon={DollarSign}   label="Revenus (mois)"  value={`${data.revenue.thisMonth.toLocaleString()} ${data.revenue.currency}`}
          sub={`Total: ${data.revenue.total.toLocaleString()}`} color="bg-emerald-600" />
        <StatCard icon={AlertTriangle} label="Signalements"   value={data.reports.open}
          sub="Non résolus" color="bg-red-600" />
        <StatCard icon={TrendingUp}   label="Avis en attente" value={data.reviews.pending}
          sub="À modérer" color="bg-indigo-600" />
      </div>
    </div>
  );
}
