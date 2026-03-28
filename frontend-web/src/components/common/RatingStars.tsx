interface RatingStarsProps {
  rating: number;   // 0 à 5
  count?:  number;
  size?:   'sm' | 'md' | 'lg';
}

const SIZES = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' };

export function RatingStars({ rating, count, size = 'md' }: RatingStarsProps) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;

  return (
    <div className={`flex items-center gap-1 ${SIZES[size]}`} aria-label={`Note : ${rating} sur 5${count ? `, ${count} avis` : ''}`}>
      <span className="flex" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => {
          if (i < full)               return <span key={i} className="text-yellow-400">★</span>;
          if (i === full && half)     return <span key={i} className="text-yellow-400">½</span>;
          return                             <span key={i} className="text-gray-300">★</span>;
        })}
      </span>
      <span className="font-semibold text-gray-900">{rating.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-gray-500 text-xs">({count})</span>
      )}
    </div>
  );
}
