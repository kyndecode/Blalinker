import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Star, CheckCircle, MessageSquare, Calendar } from 'lucide-react';
import api from '../../services/api';

type ProviderCategory = {
  id?: string | number;
  name?: string;
  category?: { name?: string };
};

type ProviderReview = {
  id: string | number;
  rating?: number;
  comment?: string;
  createdAt: string | Date;
  client?: {
    firstName?: string;
    email?: string;
  };
};

type ProviderData = {
  profile?: {
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
    bio?: string;
    city?: string;
  };
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  city?: string;
  rating?: number;
  reviewCount?: number;
  _count?: {
    reviews?: number;
  };
  categories?: ProviderCategory[];
  services?: ProviderCategory[];
  reviews?: ProviderReview[];
  isVerified?: boolean;
};

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`} />;
}

export default function ProviderProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<ProviderData | { data: ProviderData }>({
    queryKey: ['provider', id],
    queryFn: () => api.get(`/providers/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const provider = (data && 'data' in data ? data.data : data) ?? null;
  const profile = provider?.profile ?? provider;
  const firstName = profile?.firstName ?? '';
  const lastName = profile?.lastName ?? '';
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || '?';
  const rating = provider?.rating ?? 0;
  const reviewCount = provider?.reviewCount ?? provider?._count?.reviews ?? 0;
  const bio = profile?.bio ?? provider?.bio ?? '';
  const city = profile?.city ?? provider?.city ?? '';
  const categories: ProviderCategory[] = provider?.categories ?? provider?.services ?? [];
  const reviews: ProviderReview[] = provider?.reviews ?? [];

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm flex gap-5">
          <SkeletonBlock className="w-24 h-24 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-3 pt-1">
            <SkeletonBlock className="h-6 w-48" />
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-3/4" />
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-3">
          <SkeletonBlock className="h-5 w-32" />
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-7 w-20 rounded-full" />
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm space-y-4">
          <SkeletonBlock className="h-5 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !provider) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500 dark:text-gray-400 text-lg">Prestataire introuvable.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-green-600 dark:text-green-400 hover:underline text-sm font-medium"
        >
          ← Retour
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      {/* Header card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row gap-5">
          {/* Avatar */}
          <div className="shrink-0">
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={`${firstName} ${lastName}`}
                className="w-24 h-24 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-2xl font-bold text-green-700 dark:text-green-400">
                {initials}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {firstName} {lastName}
              </h1>
              {provider?.isVerified && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-3 h-3" />
                  Vérifié
                </span>
              )}
            </div>

            {/* Rating */}
            {reviewCount > 0 && (
              <div className="flex items-center gap-1.5 mb-2">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < Math.round(rating)
                          ? 'text-yellow-400 fill-yellow-400'
                          : 'text-gray-300 dark:text-gray-600'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {Number(rating).toFixed(1)}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  ({reviewCount} avis)
                </span>
              </div>
            )}

            {/* City */}
            {city && (
              <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-3">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {city}
              </div>
            )}

            {/* Bio */}
            {bio && (
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3">
                {bio}
              </p>
            )}
          </div>
        </div>

        {/* Book button */}
        <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => navigate(`/bookings/new?provider=${id}`)}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Réserver
          </button>
          <button
            onClick={() => navigate(`/contact?subject=support_booking&providerId=${id}`)}
            className="flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 font-medium py-2.5 px-5 rounded-xl transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Message
          </button>
        </div>
      </div>

      {/* Categories / Services */}
      {categories.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
            Services proposés
          </h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <span
                key={cat.id ?? cat.name}
                className="px-3 py-1 rounded-full text-sm font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800"
              >
                {cat.name ?? cat.category?.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Reviews */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
          Avis clients {reviewCount > 0 && <span className="font-normal normal-case text-gray-400">({reviewCount})</span>}
        </h2>

        {reviews.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500">Aucun avis pour le moment.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((rev) => (
              <div key={rev.id} className="pb-4 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {rev.client?.firstName ?? rev.client?.email ?? 'Anonyme'}
                  </span>
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3.5 h-3.5 ${
                          i < Math.round(Number(rev.rating ?? 0))
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-300 dark:text-gray-600'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {rev.comment && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {rev.comment}
                  </p>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {new Date(rev.createdAt).toLocaleDateString('fr-FR')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
