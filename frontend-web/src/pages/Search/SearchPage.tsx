import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ProviderCard, type ProviderData } from '../../components/provider/ProviderCard';
import api from '../../services/api';

interface SearchFilters {
  lat:            number;
  lng:            number;
  radius:         number;
  category_id?:   string;
  min_rating:     number;
  available_only: boolean;
  page:           number;
}

const DEFAULT_LAT = 14.6937;  // Dakar
const DEFAULT_LNG = -17.4441;

export default function SearchPage() {
  const { t }        = useTranslation();
  const navigate     = useNavigate();
  const [params]     = useSearchParams();

  const [filters, setFilters] = useState<SearchFilters>({
    lat:            DEFAULT_LAT,
    lng:            DEFAULT_LNG,
    radius:         10,
    min_rating:     0,
    available_only: false,
    page:           1,
  });

  const [locationLoading, setLocationLoading] = useState(false);

  // Géolocalisation automatique au montage
  useEffect(() => {
    if (navigator.geolocation) {
      setLocationLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFilters((f) => ({
            ...f,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }));
          setLocationLoading(false);
        },
        () => setLocationLoading(false),
        { timeout: 5000 }
      );
    }
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['providers-search', filters],
    queryFn: async () => {
      const res = await api.get('/providers/search', { params: filters });
      return res.data as {
        data: ProviderData[];
        meta: { total: number; page: number; totalPages: number };
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('search.title')}</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ─── Panneau filtres ─────────────────────────── */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('search.filters')}</h2>

            <div className="flex flex-col gap-4">
              {/* Rayon */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  {t('search.radius')} : <strong>{filters.radius} km</strong>
                </label>
                <input
                  type="range" min={1} max={50} value={filters.radius}
                  onChange={(e) => setFilters((f) => ({ ...f, radius: Number(e.target.value), page: 1 }))}
                  className="w-full accent-green-600"
                />
              </div>

              {/* Note minimale */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  {t('search.min_rating')}
                </label>
                <select
                  value={filters.min_rating}
                  onChange={(e) => setFilters((f) => ({ ...f, min_rating: Number(e.target.value), page: 1 }))}
                  className="input"
                >
                  <option value={0}>Toutes les notes</option>
                  <option value={3}>3+ étoiles</option>
                  <option value={4}>4+ étoiles</option>
                  <option value={4.5}>4.5+ étoiles</option>
                </select>
              </div>

              {/* Disponibles uniquement */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.available_only}
                  onChange={(e) => setFilters((f) => ({ ...f, available_only: e.target.checked, page: 1 }))}
                  className="w-4 h-4 accent-green-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('search.available_only')}</span>
              </label>

              {/* Utiliser ma position */}
              <button
                onClick={() => {
                  setLocationLoading(true);
                  navigator.geolocation?.getCurrentPosition(
                    (pos) => {
                      setFilters((f) => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude, page: 1 }));
                      setLocationLoading(false);
                    },
                    () => setLocationLoading(false)
                  );
                }}
                className="btn-secondary text-sm"
                disabled={locationLoading}
              >
                {locationLoading ? '📍 Localisation...' : '📍 Ma position'}
              </button>
            </div>
          </div>
        </aside>

        {/* ─── Résultats ───────────────────────────────── */}
        <div className="flex-1">
          {/* Compteur */}
          {!isLoading && data && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {data.meta.total === 0
                ? t('search.no_results')
                : `${data.meta.total} prestataire${data.meta.total > 1 ? 's' : ''} trouvé${data.meta.total > 1 ? 's' : ''}`
              }
            </p>
          )}

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy aria-label={t('search.loading')}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 animate-pulse h-40" />
              ))}
            </div>
          )}

          {isError && (
            <div className="card text-center text-red-600 py-8">
              {t('errors.network')}
            </div>
          )}

          {!isLoading && !isError && data?.data.length === 0 && (
            <div className="card text-center py-12">
              <p className="text-4xl mb-3" aria-hidden="true">🔍</p>
              <p className="text-gray-600">{t('search.no_results')}</p>
              <p className="text-sm text-gray-500 mt-1">Essayez d'augmenter le rayon de recherche.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data?.data.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onBook={(id) => navigate(`/bookings/new?provider=${id}`)}
              />
            ))}
          </div>

          {/* Pagination */}
          {data && data.meta.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                disabled={filters.page <= 1}
                className="btn-secondary px-3 py-1.5"
              >
                ← Précédent
              </button>
              <span className="px-4 py-1.5 text-sm text-gray-600">
                {filters.page} / {data.meta.totalPages}
              </span>
              <button
                onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                disabled={filters.page >= data.meta.totalPages}
                className="btn-secondary px-3 py-1.5"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
