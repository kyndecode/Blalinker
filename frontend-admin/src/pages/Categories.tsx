import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export default function Categories() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get('/admin/categories').then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Catégories</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-4 animate-pulse h-20" />
          ))
          : data?.data?.map((c: any) => (
            <div key={c.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-3 hover:border-green-700 transition-colors">
              {c.iconUrl && <img src={c.iconUrl} alt={c.name} className="w-10 h-10 rounded-lg object-cover" />}
              <div>
                <p className="text-white font-semibold">{c.name}</p>
                <p className="text-gray-500 text-xs">{c._count?.services ?? 0} services</p>
              </div>
            </div>
          ))
        }
        {!isLoading && (!data?.data || data.data.length === 0) && (
          <p className="text-gray-500 text-sm col-span-3">Aucune catégorie pour le moment.</p>
        )}
      </div>
    </div>
  );
}
