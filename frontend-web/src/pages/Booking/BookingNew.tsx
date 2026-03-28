import { useSearchParams } from 'react-router-dom';
export default function BookingNew() {
  const [params] = useSearchParams();
  return <div className="max-w-2xl mx-auto px-4 py-8"><h1 className="text-2xl font-bold">Nouvelle réservation</h1><p>Prestataire: {params.get('provider')}</p></div>;
}
