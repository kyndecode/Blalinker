import { useId } from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'white' | 'dark';
  showText?: boolean;
}

const sizes = {
  sm: { icon: 28, text: 'text-base' },
  md: { icon: 36, text: 'text-xl'   },
  lg: { icon: 56, text: 'text-3xl'  },
};

export default function Logo({ size = 'md', variant = 'default', showText = true }: LogoProps) {
  const uid    = useId().replace(/:/g, '');
  const gradId = `bla-g-${uid}`;
  const s      = sizes[size];
  const textColor = variant === 'white' ? 'text-white' : 'text-gray-900 dark:text-white';

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg width={s.icon} height={s.icon} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="24" cy="24" r="24" fill={`url(#${gradId})`} />
        <path
          d="M30 10c-3.866 0-7 3.134-7 7 0 .734.115 1.44.326 2.101L14 28.437 14 34l6 0 9.337-9.326A7 7 0 1 0 30 10zm0 10a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"
          fill="white"
          opacity="0.95"
        />
        <circle cx="16" cy="32" r="3" fill="#f97316" />
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#16a34a" />
            <stop offset="1" stopColor="#15803d" />
          </linearGradient>
        </defs>
      </svg>

      {/* Texte */}
      {showText && (
        <span className={`font-extrabold tracking-tight leading-none ${s.text} ${textColor}`}>
          BLA
          <span className="text-green-600 font-extrabold" style={{ fontSize: '0.55em', verticalAlign: 'super', marginLeft: '1px' }}>
            services
          </span>
        </span>
      )}
    </span>
  );
}
