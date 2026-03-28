import { useAuthStore } from '../../store/authStore';
export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">Tableau de bord</h1>
      <p className="text-gray-600">Bienvenue, {user?.role === 'provider' ? 'Prestataire' : 'Client'} !</p>
    </div>
  );
}
