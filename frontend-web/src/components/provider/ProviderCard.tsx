import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RatingStars } from '../common/RatingStars';
import { Button } from '../common/Button';

export interface ProviderData {
  id:            string;
  firstName:     string;
  lastName:      string;
  avatarUrl?:    string;
  city?:         string;
  ratingAverage: number;
  ratingCount:   number;
  hourlyRate?:   number;
  distanceKm:    number;
  isAvailable:   boolean;
  isPremium:     boolean;
  categories:    string[];
}

interface ProviderCardProps {
  provider:  ProviderData;
  onBook?:   (id: string) => void;
}

export function ProviderCard({ provider, onBook }: ProviderCardProps) {
  const { t } = useTranslation();

  return (
    <article className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 hover:shadow-md hover:border-green-200 dark:hover:border-green-800 transition-all duration-200">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {provider.avatarUrl ? (
            <img
              src={provider.avatarUrl}
              alt={`${provider.firstName} ${provider.lastName}`}
              className="w-14 h-14 rounded-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 font-semibold text-lg" aria-hidden="true">
              {provider.firstName[0]}{provider.lastName[0]}
            </div>
          )}
        </div>

        {/* Infos */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {provider.firstName} {provider.lastName}
            </h3>
            {provider.isPremium && (
              <span className="badge badge-orange" title="Prestataire Premium">★ Premium</span>
            )}
            <span className={`badge ${provider.isAvailable ? 'badge-green' : 'badge-gray'}`}>
              {provider.isAvailable ? t('provider.available') : t('provider.unavailable')}
            </span>
          </div>

          {/* Catégories */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {provider.categories.join(' · ')}
          </p>

          {/* Note */}
          <div className="mt-1.5">
            <RatingStars rating={provider.ratingAverage} count={provider.ratingCount} size="sm" />
          </div>

          {/* Distance + prix */}
          <div className="flex items-center gap-4 mt-1.5 text-sm text-gray-600 dark:text-gray-400">
            <span>📍 {provider.distanceKm} km</span>
            {provider.hourlyRate && (
              <span>💰 {provider.hourlyRate.toLocaleString('fr-SN')} XOF/h</span>
            )}
            {provider.city && <span>🏙 {provider.city}</span>}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
        <Link
          to={`/provider/${provider.id}`}
          className="btn-secondary text-sm py-1.5 flex-1 text-center"
        >
          Voir le profil
        </Link>
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          disabled={!provider.isAvailable}
          onClick={() => onBook?.(provider.id)}
        >
          {t('provider.book')}
        </Button>
      </div>
    </article>
  );
}
