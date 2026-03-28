import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
export default function ProviderProfile() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({ queryKey: ['provider', id], queryFn: () => api.get(`/providers/${id}`).then(r => r.data) });
  if (isLoading) return <div className="max-w-2xl mx-auto p-8 animate-pulse">Chargement...</div>;
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">{data?.profile?.firstName} {data?.profile?.lastName}</h1>
    </div>
  );
}
