import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ProviderCard, type ProviderData } from '../../components/provider/ProviderCard';
import { Button } from '../../components/common/Button';
import api from '../../services/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  children: Array<{ id: string; name: string; slug: string }>;
}

interface ProviderSearchResult extends ProviderData {
  country?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface SearchFilters {
  lat: number;
  lng: number;
  radius: number;
  category_id?: string;
  min_rating: number;
  max_price?: number;
  available_only: boolean;
  page: number;
}

const DEFAULT_LAT = 5.35995;
const DEFAULT_LNG = -4.00826;

function MapCenterUpdater({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

function buildProviderIcon(isAvailable: boolean): L.DivIcon {
  const color = isAvailable ? '#16a34a' : '#6b7280';
  return L.divIcon({
    className: '',
    html: `<span style="
      display:inline-flex;
      width:18px;height:18px;
      border-radius:999px;
      border:2px solid #ffffff;
      background:${color};
      box-shadow:0 2px 8px rgba(0,0,0,.35);
    "></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const categorySlug = params.get('category') ?? '';

  const [filters, setFilters] = useState<SearchFilters>({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
    radius: 12,
    min_rating: 0,
    available_only: false,
    page: 1,
  });
  const [locationLoading, setLocationLoading] = useState(false);

  const { data: allCategories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((res) => res.data),
    staleTime: 60 * 60 * 1000,
  });

  const activeParent = allCategories.find((category) => category.slug === categorySlug) ?? null;
  const subcategories = activeParent?.children ?? [];

  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFilters((prev) => ({
          ...prev,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }));
        setLocationLoading(false);
      },
      () => setLocationLoading(false),
      { timeout: 5000 }
    );
  }, []);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['providers-search', filters],
    queryFn: async () => {
      const response = await api.get('/providers/search', { params: filters });
      return response.data as {
        data: ProviderSearchResult[];
        meta: { total: number; page: number; totalPages: number };
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const providerMarkers = useMemo(() => {
    return (data?.data ?? [])
      .map((provider) => ({
        ...provider,
        latitude: provider.latitude !== null && provider.latitude !== undefined ? Number(provider.latitude) : null,
        longitude: provider.longitude !== null && provider.longitude !== undefined ? Number(provider.longitude) : null,
      }))
      .filter((provider) => typeof provider.latitude === 'number' && typeof provider.longitude === 'number');
  }, [data?.data]);

  const recommendedProviders = useMemo(() => {
    return [...(data?.data ?? [])]
      .map((provider) => ({
        ...provider,
        smartScore:
          Number(provider.ratingAverage) * 20
          + (provider.isAvailable ? 15 : 0)
          - Math.min(Number(provider.distanceKm) * 1.5, 20)
          + (provider.isPremium ? 5 : 0),
      }))
      .sort((a, b) => b.smartScore - a.smartScore)
      .slice(0, 3);
  }, [data?.data]);

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFilters((prev) => ({
          ...prev,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          page: 1,
        }));
        setLocationLoading(false);
      },
      () => setLocationLoading(false)
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {activeParent && (
        <div className="flex items-center gap-2 mb-4 text-sm text-gray-500 dark:text-gray-400">
          <button onClick={() => navigate('/search')} className="hover:text-green-600 dark:hover:text-green-400">
            {t('search.all_categories')}
          </button>
          <span>/</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {activeParent.iconUrl} {activeParent.name}
          </span>
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        {activeParent ? activeParent.name : t('search.title')}
      </h1>

      {subcategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, category_id: undefined, page: 1 }))}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              !filters.category_id
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-green-500 hover:text-green-600 dark:hover:text-green-400'
            }`}
          >
            {t('search.all')}
          </button>
          {subcategories.map((subcategory) => (
            <button
              key={subcategory.id}
              onClick={() => setFilters((prev) => ({ ...prev, category_id: subcategory.id, page: 1 }))}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                filters.category_id === subcategory.id
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-green-500 hover:text-green-600 dark:hover:text-green-400'
              }`}
            >
              {subcategory.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-72 flex-shrink-0">
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-4">{t('search.filters')}</h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  {t('search.radius')}: <strong>{filters.radius} km</strong>
                </label>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={filters.radius}
                  onChange={(event) => setFilters((prev) => ({ ...prev, radius: Number(event.target.value), page: 1 }))}
                  className="w-full accent-green-600"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  {t('search.min_rating')}
                </label>
                <select
                  value={filters.min_rating}
                  onChange={(event) => setFilters((prev) => ({ ...prev, min_rating: Number(event.target.value), page: 1 }))}
                  className="input"
                >
                  <option value={0}>{t('search.all_ratings')}</option>
                  <option value={3}>3+ ⭐</option>
                  <option value={4}>4+ ⭐</option>
                  <option value={4.5}>4.5+ ⭐</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                  {t('search.max_price')}
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={filters.max_price ?? ''}
                  onChange={(event) => {
                    const value = event.target.value.trim();
                    setFilters((prev) => ({
                      ...prev,
                      max_price: value ? Number(value) : undefined,
                      page: 1,
                    }));
                  }}
                  placeholder="Ex: 15000"
                  className="input"
                />
              </div>

              {!activeParent && allCategories.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                    {t('search.category')}
                  </label>
                  <select
                    value={categorySlug}
                    onChange={(event) => navigate(event.target.value ? `/search?category=${event.target.value}` : '/search')}
                    className="input"
                  >
                    <option value="">{t('search.all_categories')}</option>
                    {allCategories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.iconUrl} {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.available_only}
                  onChange={(event) => setFilters((prev) => ({ ...prev, available_only: event.target.checked, page: 1 }))}
                  className="w-4 h-4 accent-green-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{t('search.available_only')}</span>
              </label>

              <Button
                variant="secondary"
                onClick={requestCurrentLocation}
                disabled={locationLoading}
                className="text-sm"
              >
                {locationLoading ? t('search.locating') : t('search.use_location')}
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex-1 space-y-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-3 overflow-hidden">
            <MapContainer
              center={[filters.lat, filters.lng]}
              zoom={12}
              scrollWheelZoom
              className="w-full h-[330px] rounded-xl"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapCenterUpdater lat={filters.lat} lng={filters.lng} />
              <Circle center={[filters.lat, filters.lng]} radius={filters.radius * 1000} pathOptions={{ color: '#16a34a', fillOpacity: 0.08 }} />
              <Marker position={[filters.lat, filters.lng]} icon={buildProviderIcon(true)}>
                <Popup>{t('search.you_are_here')}</Popup>
              </Marker>
              {providerMarkers.map((provider) => (
                <Marker
                  key={provider.id}
                  position={[provider.latitude as number, provider.longitude as number]}
                  icon={buildProviderIcon(provider.isAvailable)}
                >
                  <Popup>
                    <div className="min-w-[180px]">
                      <p className="font-semibold">{provider.firstName} {provider.lastName}</p>
                      <p className="text-xs mt-1">{provider.city || provider.country || '-'}</p>
                      <p className="text-xs mt-1">
                        {t('search.provider_distance', { km: provider.distanceKm })}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          className="text-xs px-2 py-1 rounded bg-green-600 text-white"
                          onClick={() => navigate(`/provider/${provider.id}`)}
                        >
                          {t('provider.contact')}
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded border border-gray-300"
                          onClick={() => navigate(`/bookings/new?provider=${provider.id}`)}
                        >
                          {t('provider.book')}
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {recommendedProviders.length > 0 && (
            <div className="bg-gradient-to-r from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20 border border-emerald-100 dark:border-emerald-900 rounded-2xl p-4">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
                {t('search.smart_recommendations')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {recommendedProviders.map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => navigate(`/provider/${provider.id}`)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 text-gray-700 dark:text-gray-200 hover:border-emerald-500"
                  >
                    {provider.firstName} {provider.lastName} - {provider.distanceKm} km
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isLoading && data && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {data.meta.total === 0
                ? t('search.no_results')
                : t('search.results_plural', { count: data.meta.total })}
            </p>
          )}

          {isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy>
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 animate-pulse h-40" />
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
              <p className="text-gray-600 dark:text-gray-400">{t('search.no_results')}</p>
              <p className="text-sm text-gray-500 mt-1">{t('search.try_expand_radius')}</p>
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

          {data && data.meta.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={filters.page <= 1}
                className="btn-secondary px-3 py-1.5"
              >
                {t('search.prev')}
              </button>
              <span className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400">
                {filters.page} / {data.meta.totalPages}
              </span>
              <button
                onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={filters.page >= data.meta.totalPages}
                className="btn-secondary px-3 py-1.5"
              >
                {t('search.next')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
