interface RatingStarsProps {
  /** 0 à 5. L'API peut renvoyer un décimal sous forme de texte (« 4.6 ») : converti ici. */
  rating: number | string | null | undefined;
  count?:  number;
  size?:   'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' };

export function RatingStars({ rating: raw, count, size = 'md' }: RatingStarsProps) {
  // Avant : « rating.toFixed is not a function » sur une note texte effaçait toute la page (carte).
  const rating = Math.min(5, Math.max(0, Number(raw) || 0));
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;

  return (
    <div className={`flex items-center gap-1 ${SIZES[size]}`} aria-label={`Note : ${rating.toFixed(1)} sur 5${count ? `, ${count} avis` : ''}`}>
      <span className="flex" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => {
          if (i < full)               return <span key={i} className="text-yellow-400">★</span>;
          if (i === full && half)     return <span key={i} className="text-yellow-400">½</span>;
          return                             <span key={i} className="text-gray-300 dark:text-gray-600">★</span>;
        })}
      </span>
      <span className="font-semibold text-gray-900 dark:text-white">{rating.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-gray-500 dark:text-gray-400 text-xs">({count})</span>
      )}
    </div>
  );
}
