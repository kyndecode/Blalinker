import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { getApiErrorMessage } from '../../utils/apiError';
import { formatLocale } from '../../utils/locale';

interface SearchItem {
  id: string; title: string; description: string | null; price: number | null; priceType: string | null;
  category: { name: string; slug: string };
  provider: { id: string; firstName: string | null; lastName: string | null; businessName: string | null; city: string | null; avatarUrl: string | null; idVerified: boolean; isAvailable: boolean; ratingAverage: number; ratingCount: number };
  distanceKm: number | null;
}
interface SearchResponse { data: SearchItem[]; meta: { total: number; page: number; totalPages: number }; didYouMean: string | null }
interface Suggestions { categories: Array<{ name: string; slug: string }>; services: Array<{ title: string; providers: number }>; cities: Array<{ city: string; providers: number }> }
interface Category { id: string; name: string; slug: string }

const SORTS = ['relevance', 'rating', 'price_asc', 'price_desc', 'distance'] as const;

/** Suggestions pendant la saisie (temporisées), navigables au clavier. */
function useSuggestions(text: string) {
  const [debounced, setDebounced] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  return useQuery<Suggestions>({
    queryKey: ['search-suggest', debounced],
    queryFn: () => api.get('/search/suggest', { params: { q: debounced } }).then((r) => ({
      categories: Array.isArray(r.data?.categories) ? r.data.categories : [],
      services: Array.isArray(r.data?.services) ? r.data.services : [],
      cities: Array.isArray(r.data?.cities) ? r.data.cities : [],
    })),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });
}

export default function TextSearch() {
  const { t, i18n } = useTranslation();
  const locale = formatLocale(i18n.language);
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const city = params.get('city') ?? '';
  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'relevance';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const lat = params.get('lat');
  const lng = params.get('lng');

  const [text, setText] = useState(q);
  const [cityText, setCityText] = useState(city);
  const [open, setOpen] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setText(q); }, [q]);
  useEffect(() => { setCityText(city); }, [city]);

  const suggestions = useSuggestions(text);
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then((r) => (Array.isArray(r.data) ? r.data : [])),
    staleTime: 60 * 60_000,
  });

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    if (!('page' in next)) p.delete('page');
    setParams(p);
  };

  const query = { q, city, category, sort, page: String(page), ...(lat && lng ? { lat, lng, radiusKm: '15' } : {}) };
  const { data, isLoading, isError, error } = useQuery<SearchResponse>({
    queryKey: ['search', query],
    queryFn: () => api.get('/search', { params: Object.fromEntries(Object.entries(query).filter(([, v]) => v)) }).then((r) => ({
      data: Array.isArray(r.data?.data) ? r.data.data : [],
      meta: r.data?.meta ?? { total: 0, page: 1, totalPages: 0 },
      didYouMean: typeof r.data?.didYouMean === 'string' ? r.data.didYouMean : null,
    })),
    staleTime: 30_000,
  });

  useEffect(() => {
    const close = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setOpen(false);
    update({ q: text.trim() || null, city: cityText.trim() || null });
  };

  const aroundMe = () => {
    setGeoError(null);
    if (!navigator.geolocation) { setGeoError(t('text_search.geo_unavailable')); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => update({ lat: pos.coords.latitude.toFixed(3), lng: pos.coords.longitude.toFixed(3), sort: 'distance' }),
      () => setGeoError(t('text_search.geo_denied')),
      { timeout: 8000 },
    );
  };

  const s = suggestions.data;
  const hasSuggestions = Boolean(s && (s.categories.length || s.services.length || s.cities.length));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{t('search.title')}</h1>

      <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 sm:grid-cols-[2fr_1fr_auto]" role="search">
        <div className="relative" ref={boxRef}>
          <label htmlFor="search-q" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{t('text_search.what_label')}</label>
          <input
            id="search-q"
            type="search"
            value={text}
            onChange={(e) => { setText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={t('text_search.what_placeholder')}
            autoComplete="off"
            role="combobox"
            aria-expanded={open && hasSuggestions}
            aria-controls={listId}
            aria-describedby="search-q-help"
            className="input w-full"
          />
          <p id="search-q-help" className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('text_search.what_help')}</p>
          {open && hasSuggestions && (
            <ul id={listId} role="listbox" aria-label={t('text_search.suggestions')} className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl">
              {s!.categories.map((c) => (
                <li key={`c-${c.slug}`} role="option" aria-selected="false">
                  <button type="button" onClick={() => { setOpen(false); update({ category: c.slug, q: null }); }} className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 dark:hover:bg-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('text_search.suggest_category')} · </span>{c.name}
                  </button>
                </li>
              ))}
              {s!.services.map((sv) => (
                <li key={`s-${sv.title}`} role="option" aria-selected="false">
                  <button type="button" onClick={() => { setOpen(false); setText(sv.title); update({ q: sv.title }); }} className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 dark:hover:bg-gray-700">
                    {sv.title} <span className="text-xs text-gray-500 dark:text-gray-400">({t('text_search.suggest_providers', { count: sv.providers })})</span>
                  </button>
                </li>
              ))}
              {s!.cities.map((c) => (
                <li key={`v-${c.city}`} role="option" aria-selected="false">
                  <button type="button" onClick={() => { setOpen(false); setCityText(c.city); update({ city: c.city }); }} className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 dark:hover:bg-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('text_search.suggest_city')} · </span>{c.city}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label htmlFor="search-city" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">{t('text_search.city_label')}</label>
          <input id="search-city" value={cityText} onChange={(e) => setCityText(e.target.value)} placeholder={t('text_search.city_placeholder')} className="input w-full" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full">{t('text_search.submit')}</button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 whitespace-nowrap text-gray-700 dark:text-gray-300">
          {t('text_search.category_label')}
          <select value={category} onChange={(e) => update({ category: e.target.value || null })} className="input py-1.5">
            <option value="">{t('text_search.category_all')}</option>
            {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 whitespace-nowrap text-gray-700 dark:text-gray-300">
          {t('text_search.sort_label')}
          <select value={sort} onChange={(e) => update({ sort: e.target.value })} className="input py-1.5">
            {SORTS.filter((o) => o !== 'distance' || (lat && lng)).map((o) => <option key={o} value={o}>{t(`text_search.sort_${o}`)}</option>)}
          </select>
        </label>
        {lat && lng
          ? <button type="button" onClick={() => update({ lat: null, lng: null, sort: sort === 'distance' ? 'relevance' : sort })} className="text-green-700 dark:text-green-400 hover:underline">{t('text_search.around_me_stop')}</button>
          : <button type="button" onClick={aroundMe} className="text-green-700 dark:text-green-400 hover:underline"><span aria-hidden="true">📍 </span>{t('text_search.around_me')}</button>}
        {(q || city || category) && <button type="button" onClick={() => setParams(new URLSearchParams())} className="text-gray-600 dark:text-gray-400 hover:underline">{t('text_search.clear')}</button>}
        <Link to={`/search?mode=map${category ? `&category=${encodeURIComponent(category)}` : ''}`} className="ml-auto text-green-700 dark:text-green-400 hover:underline">{t('text_search.map')}</Link>
      </div>
      {geoError && <p role="alert" className="mt-2 text-sm text-red-600">{geoError}</p>}

      <section aria-live="polite" aria-busy={isLoading} className="mt-6">
        {isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">{t('text_search.loading')}</p>}
        {isError && <p role="alert" className="text-sm text-red-600">{getApiErrorMessage(error, t('text_search.error'))}</p>}
        {data && (
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-400" data-testid="search-count">
            {t('text_search.count', { count: data.meta.total })}{q ? t('text_search.count_query', { q }) : ''}{city ? t('text_search.count_city', { city }) : ''}
          </p>
        )}
        {data && data.data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-600 dark:text-gray-300">
            {data.didYouMean
              ? <p>{t('text_search.did_you_mean')} <button type="button" onClick={() => update({ q: data.didYouMean })} className="font-semibold text-green-700 dark:text-green-400 underline">{data.didYouMean}</button>{t('text_search.question_mark')}</p>
              : <p>{t('text_search.no_match')}</p>}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('text_search.no_match_tip')}</p>
          </div>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {data?.data.map((item) => {
            const name = item.provider.businessName || `${item.provider.firstName ?? ''} ${item.provider.lastName ?? ''}`.trim() || t('text_search.provider_fallback');
            return (
              <li key={item.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
                <p className="text-xs text-green-700 dark:text-green-400">{item.category.name}</p>
                <h2 className="font-semibold text-gray-900 dark:text-white">{item.title}</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {name}{item.provider.city ? ` · ${item.provider.city}` : ''}{item.distanceKm !== null ? ` · ${item.distanceKm.toLocaleString(locale)} km` : ''}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {item.provider.ratingCount > 0
                    ? <span aria-label={t('text_search.rating_aria', { rating: item.provider.ratingAverage.toFixed(1) })}>★ {item.provider.ratingAverage.toFixed(1)} ({item.provider.ratingCount})</span>
                    : <span className="text-gray-500 dark:text-gray-400">{t('text_search.no_reviews')}</span>}
                  {item.provider.idVerified && <span className="ml-2 rounded-full bg-green-50 dark:bg-green-900/30 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">{t('provider.verified')}</span>}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-semibold text-gray-900 dark:text-white">{item.price !== null ? `${item.price.toLocaleString(locale)} XOF` : t('text_search.price_on_quote')}</span>
                  <Link to={`/provider/${item.provider.id}`} className="text-sm font-medium text-green-700 dark:text-green-400 hover:underline">{t('text_search.view_profile')}</Link>
                </div>
              </li>
            );
          })}
        </ul>
        {data && data.meta.totalPages > 1 && (
          <nav className="mt-6 flex items-center justify-center gap-4" aria-label={t('text_search.pagination')}>
            <button onClick={() => update({ page: String(page - 1) })} disabled={page <= 1} className="btn-secondary disabled:opacity-50">{t('search.prev')}</button>
            <span className="text-sm text-gray-600 dark:text-gray-300">{t('text_search.page_of', { page, total: data.meta.totalPages })}</span>
            <button onClick={() => update({ page: String(page + 1) })} disabled={page >= data.meta.totalPages} className="btn-secondary disabled:opacity-50">{t('search.next')}</button>
          </nav>
        )}
      </section>
    </div>
  );
}
