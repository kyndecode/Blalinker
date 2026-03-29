import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const CATEGORIES = [
  {
    slug: 'batiment',
    labelKey: 'home.categories.batiment.label',
    icon: '🏗️',
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    border: 'border-orange-100 dark:border-orange-900',
    subKeys: [
      'home.categories.batiment.sub1',
      'home.categories.batiment.sub2',
      'home.categories.batiment.sub3',
    ],
  },
  {
    slug: 'transport',
    labelKey: 'home.categories.transport.label',
    icon: '🚗',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-100 dark:border-blue-900',
    subKeys: [
      'home.categories.transport.sub1',
      'home.categories.transport.sub2',
      'home.categories.transport.sub3',
    ],
  },
  {
    slug: 'beaute',
    labelKey: 'home.categories.beaute.label',
    icon: '💇',
    bg: 'bg-pink-50 dark:bg-pink-950/40',
    border: 'border-pink-100 dark:border-pink-900',
    subKeys: [
      'home.categories.beaute.sub1',
      'home.categories.beaute.sub2',
      'home.categories.beaute.sub3',
    ],
  },
  {
    slug: 'education',
    labelKey: 'home.categories.education.label',
    icon: '🎓',
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    border: 'border-violet-100 dark:border-violet-900',
    subKeys: [
      'home.categories.education.sub1',
      'home.categories.education.sub2',
      'home.categories.education.sub3',
    ],
  },
  {
    slug: 'nettoyage-menage',
    labelKey: 'home.categories.nettoyage.label',
    icon: '🧹',
    bg: 'bg-teal-50 dark:bg-teal-950/40',
    border: 'border-teal-100 dark:border-teal-900',
    subKeys: [
      'home.categories.nettoyage.sub1',
      'home.categories.nettoyage.sub2',
      'home.categories.nettoyage.sub3',
    ],
  },
  {
    slug: 'numerique',
    labelKey: 'home.categories.numerique.label',
    icon: '💻',
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    border: 'border-indigo-100 dark:border-indigo-900',
    subKeys: [
      'home.categories.numerique.sub1',
      'home.categories.numerique.sub2',
      'home.categories.numerique.sub3',
    ],
  },
  {
    slug: 'reparation',
    labelKey: 'home.categories.reparation.label',
    icon: '🔧',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-100 dark:border-amber-900',
    subKeys: [
      'home.categories.reparation.sub1',
      'home.categories.reparation.sub2',
      'home.categories.reparation.sub3',
    ],
  },
  {
    slug: 'emploi',
    labelKey: 'home.categories.emploi.label',
    icon: '💼',
    bg: 'bg-green-50 dark:bg-green-950/40',
    border: 'border-green-100 dark:border-green-900',
    subKeys: [
      'home.categories.emploi.sub1',
      'home.categories.emploi.sub2',
      'home.categories.emploi.sub3',
    ],
  },
];

const STATS = [
  { value: '2 000+', labelKey: 'home.stats_providers' },
  { value: '15 000+', labelKey: 'home.stats_clients' },
  { value: '98%', labelKey: 'home.stats_satisfaction' },
];

const STEPS = [
  {
    n: '1',
    titleKey: 'home.step1_title',
    descKey: 'home.step1_desc',
    color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  },
  {
    n: '2',
    titleKey: 'home.step2_title',
    descKey: 'home.step2_desc',
    color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  },
  {
    n: '3',
    titleKey: 'home.step3_title',
    descKey: 'home.step3_desc',
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  },
];

const QUICK_CHIPS = [
  { labelKey: 'home.quick.plumber', query: 'Plombier' },
  { labelKey: 'home.quick.electrician', query: 'Électricien' },
  { labelKey: 'home.quick.carpenter', query: 'Menuisier' },
  { labelKey: 'home.quick.ac', query: 'Climatisation' },
];

const TESTIMONIALS = [
  {
    name: 'Aminata D.',
    roleKey: 'home.testimonials.client_dakar',
    textKey: 'home.testimonials.text1',
    avatar: 'A',
    stars: 5,
  },
  {
    name: 'Moussa K.',
    roleKey: 'home.testimonials.provider_abidjan',
    textKey: 'home.testimonials.text2',
    avatar: 'M',
    stars: 5,
  },
  {
    name: 'Fatoumata B.',
    roleKey: 'home.testimonials.client_bamako',
    textKey: 'home.testimonials.text3',
    avatar: 'F',
    stars: 5,
  },
];

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="bg-white dark:bg-gray-950">
      <section className="relative overflow-hidden bg-gradient-to-br from-green-800 via-green-700 to-green-900">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-white/[0.04]" />
          <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-orange-400/[0.08]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-24 sm:py-32 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
            {t('home.available_countries')}
          </div>

          <h1 className="mb-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            {t('app.tagline')}
            <br />
            <span className="text-orange-300">{t('app.tagline2')}</span>
          </h1>

          <p className="mx-auto mb-10 max-w-xl text-base text-green-100 sm:text-lg">
            {t('home.hero_subtitle')}
          </p>

          <form
            onSubmit={handleSearch}
            className="mx-auto flex max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/20 dark:bg-gray-800"
            role="search"
          >
            <div className="relative flex-1">
              <svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('home.search_placeholder')}
                className="w-full bg-transparent py-4 pl-12 pr-4 text-base text-gray-900 placeholder-gray-400 focus:outline-none dark:text-white"
                aria-label={t('home.search_aria')}
              />
            </div>
            <button
              type="submit"
              className="m-1.5 rounded-xl bg-orange-500 px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 active:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              {t('home.search_btn')}
            </button>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {QUICK_CHIPS.map((chip) => {
              const queryValue = t(chip.labelKey);
              return (
                <button
                  key={chip.labelKey}
                  onClick={() => navigate(`/search?q=${encodeURIComponent(chip.query)}`)}
                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
                >
                  {queryValue}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto grid max-w-4xl grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800">
          {STATS.map((stat) => (
            <div key={stat.labelKey} className="px-4 py-8 text-center sm:py-10">
              <p className="text-3xl font-extrabold text-green-600 dark:text-green-400 sm:text-4xl">{stat.value}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">{t(stat.labelKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white sm:text-3xl">
              {t('home.categories_title')}
            </h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">{t('home.categories_sub')}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {CATEGORIES.map((category) => (
              <button
                key={category.slug}
                onClick={() => navigate(`/search?category=${category.slug}`)}
                className={`group flex flex-col items-start gap-2 rounded-2xl border p-4 sm:p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${category.bg} ${category.border}`}
              >
                <span className="text-3xl transition-transform duration-200 group-hover:scale-110">{category.icon}</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{t(category.labelKey)}</span>
                <div className="hidden sm:flex flex-wrap gap-1 mt-0.5">
                  {category.subKeys.map((subKey) => (
                    <span key={subKey} className="text-[10px] text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-black/20 rounded-full px-1.5 py-0.5">
                      {t(subKey)}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-50 px-4 py-16 dark:bg-gray-900 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white sm:text-3xl">
              {t('home.how_title')}
            </h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">{t('home.how_sub')}</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.n} className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
                {index < STEPS.length - 1 && (
                  <div className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 sm:block">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                      <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                )}
                <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-base font-extrabold ${step.color}`}>
                  {step.n}
                </div>
                <h3 className="mb-2 font-bold text-gray-900 dark:text-white">{t(step.titleKey)}</h3>
                <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">{t(step.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-br from-green-700 to-green-900 shadow-xl">
          <div className="px-8 py-12 text-center sm:px-12">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-4xl">🛠️</div>
            <h2 className="mb-3 text-2xl font-extrabold text-white sm:text-3xl">{t('home.cta_title')}</h2>
            <p className="mx-auto mb-8 max-w-md text-base text-green-100">{t('home.cta_desc')}</p>
            <button
              onClick={() => navigate('/register?role=provider')}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-orange-600 active:bg-orange-700"
            >
              {t('home.cta_btn')}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <section className="bg-gray-50 px-4 py-16 dark:bg-gray-900 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white sm:text-3xl">
              {t('home.testimonials_title')}
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <div
                key={item.name}
                className="flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950"
              >
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: item.stars }).map((_, index) => (
                    <svg key={index} className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>

                <p className="mb-5 flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  "{t(item.textKey)}"
                </p>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-700 text-sm font-bold text-white">
                    {item.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t(item.roleKey)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
