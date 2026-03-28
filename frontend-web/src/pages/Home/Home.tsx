import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// ── Données ────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { slug: 'plomberie',     label: 'Plomberie',     icon: '🔧', bg: 'bg-blue-50   dark:bg-blue-950/40',  border: 'border-blue-100   dark:border-blue-900',  dot: 'bg-blue-500'   },
  { slug: 'electricite',   label: 'Électricité',   icon: '⚡', bg: 'bg-yellow-50 dark:bg-yellow-950/40', border: 'border-yellow-100 dark:border-yellow-900', dot: 'bg-yellow-500' },
  { slug: 'menuiserie',    label: 'Menuiserie',    icon: '🪚', bg: 'bg-amber-50  dark:bg-amber-950/40',  border: 'border-amber-100  dark:border-amber-900',  dot: 'bg-amber-500'  },
  { slug: 'climatisation', label: 'Climatisation', icon: '❄️', bg: 'bg-sky-50    dark:bg-sky-950/40',    border: 'border-sky-100    dark:border-sky-900',    dot: 'bg-sky-500'    },
  { slug: 'peinture',      label: 'Peinture',      icon: '🎨', bg: 'bg-pink-50   dark:bg-pink-950/40',   border: 'border-pink-100   dark:border-pink-900',   dot: 'bg-pink-500'   },
  { slug: 'jardinage',     label: 'Jardinage',     icon: '🌿', bg: 'bg-green-50  dark:bg-green-950/40',  border: 'border-green-100  dark:border-green-900',  dot: 'bg-green-500'  },
  { slug: 'nettoyage',     label: 'Nettoyage',     icon: '🧹', bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-100 dark:border-purple-900', dot: 'bg-purple-500' },
  { slug: 'informatique',  label: 'Informatique',  icon: '💻', bg: 'bg-indigo-50 dark:bg-indigo-950/40', border: 'border-indigo-100 dark:border-indigo-900', dot: 'bg-indigo-500' },
];

const STATS = [
  { value: '2 000+',  label: 'Prestataires vérifiés' },
  { value: '15 000+', label: 'Clients satisfaits'    },
  { value: '98%',     label: 'Taux de satisfaction'  },
];

const STEPS = [
  { n: '1', title: 'Recherchez',  desc: 'Trouvez un professionnel par service et localisation.',     color: 'bg-green-100  dark:bg-green-900/30  text-green-700  dark:text-green-300'  },
  { n: '2', title: 'Réservez',    desc: 'Choisissez votre créneau et confirmez en quelques clics.',  color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' },
  { n: '3', title: 'Payez',       desc: 'Payez en toute sécurité via Wave, Orange Money ou carte.',  color: 'bg-blue-100   dark:bg-blue-900/30   text-blue-700   dark:text-blue-300'   },
];

const TESTIMONIALS = [
  { name: 'Aminata D.',   role: 'Cliente · Dakar',      text: 'Plombier trouvé en 10 minutes. Travail impeccable, paiement via Wave. Je recommande vivement !',                  avatar: 'A', stars: 5 },
  { name: 'Moussa K.',    role: 'Prestataire · Abidjan', text: "Depuis que j'ai rejoint BLA, mon agenda est plein. La plateforme est simple et les paiements arrivent vite.", avatar: 'M', stars: 5 },
  { name: 'Fatoumata B.', role: 'Cliente · Bamako',     text: 'Interface facile même avec une connexion lente. Le prestataire était vérifié et très professionnel.',             avatar: 'F', stars: 5 },
];

// ── Composant principal ────────────────────────────────────────────────────────

export default function Home() {
  const { t }    = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="bg-white dark:bg-gray-950">

      {/* ════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green-800 via-green-700 to-green-900">
        {/* Décoration */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-white/[0.04]" />
          <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-orange-400/[0.08]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 py-24 sm:py-32 text-center">
          {/* Badge pays */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
            Disponible au Sénégal · Côte d'Ivoire · Mali · Burkina Faso
          </div>

          {/* Titre */}
          <h1 className="mb-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Trouvez le bon professionnel,<br />
            <span className="text-orange-300">en quelques secondes</span>
          </h1>

          {/* Sous-titre */}
          <p className="mx-auto mb-10 max-w-xl text-base text-green-100 sm:text-lg">
            Plombiers, électriciens, menuisiers — des prestataires vérifiés et notés, près de chez vous.
          </p>

          {/* Barre de recherche */}
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Quel service recherchez-vous ?"
                className="w-full bg-transparent py-4 pl-12 pr-4 text-base text-gray-900 placeholder-gray-400 focus:outline-none dark:text-white"
                aria-label="Rechercher un service"
              />
            </div>
            <button
              type="submit"
              className="m-1.5 rounded-xl bg-orange-500 px-7 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 active:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              {t('home.search_btn', 'Chercher')}
            </button>
          </form>

          {/* Suggestions rapides */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['Plombier', 'Électricien', 'Menuisier', 'Climatisation'].map((s) => (
              <button
                key={s}
                onClick={() => navigate(`/search?q=${s}`)}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          STATS
      ════════════════════════════════════════════════════════ */}
      <section className="border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto grid max-w-4xl grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800">
          {STATS.map((s) => (
            <div key={s.label} className="px-4 py-8 text-center sm:py-10">
              <p className="text-3xl font-extrabold text-green-600 dark:text-green-400 sm:text-4xl">{s.value}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          CATÉGORIES
      ════════════════════════════════════════════════════════ */}
      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white sm:text-3xl">
              Nos services
            </h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
              Cliquez sur un service pour trouver des professionnels disponibles
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.slug}
                onClick={() => navigate(`/search?category=${cat.slug}`)}
                className={`group flex flex-col items-center gap-3 rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 ${cat.bg} ${cat.border}`}
              >
                <span className="text-3xl transition-transform duration-200 group-hover:scale-110">{cat.icon}</span>
                <span className="text-center text-sm font-semibold text-gray-800 dark:text-gray-200">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          COMMENT ÇA MARCHE
      ════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 px-4 py-16 dark:bg-gray-900 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white sm:text-3xl">
              Comment ça marche ?
            </h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">Simple, rapide et sécurisé</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.n} className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">
                {/* Connecteur → */}
                {i < STEPS.length - 1 && (
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
                <h3 className="mb-2 font-bold text-gray-900 dark:text-white">{step.title}</h3>
                <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          CTA PRESTATAIRE
      ════════════════════════════════════════════════════════ */}
      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-br from-green-700 to-green-900 shadow-xl">
          <div className="px-8 py-12 text-center sm:px-12">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-4xl">
              🛠️
            </div>
            <h2 className="mb-3 text-2xl font-extrabold text-white sm:text-3xl">
              Vous êtes prestataire ?
            </h2>
            <p className="mx-auto mb-8 max-w-md text-base text-green-100">
              Rejoignez BLA Services et développez votre clientèle.<br />
              Inscription gratuite, commissions transparentes.
            </p>
            <button
              onClick={() => navigate('/register?role=provider')}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition-colors hover:bg-orange-600 active:bg-orange-700"
            >
              Rejoindre BLA
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          TÉMOIGNAGES
      ════════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 px-4 py-16 dark:bg-gray-900 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white sm:text-3xl">
              Ce que disent nos utilisateurs
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <div
                key={item.name}
                className="flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950"
              >
                {/* Étoiles */}
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: item.stars }).map((_, i) => (
                    <svg key={i} className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>

                {/* Texte */}
                <p className="mb-5 flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  "{item.text}"
                </p>

                {/* Auteur */}
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-green-700 text-sm font-bold text-white">
                    {item.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{item.role}</p>
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
