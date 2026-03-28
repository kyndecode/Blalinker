import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '../../components/common/Logo';

const CATEGORIES = [
  { slug: 'plomberie',     label: 'Plomberie',      emoji: '🔧', color: 'bg-blue-50   border-blue-200  hover:border-blue-400'  },
  { slug: 'electricite',   label: 'Électricité',     emoji: '⚡', color: 'bg-yellow-50 border-yellow-200 hover:border-yellow-400' },
  { slug: 'menuiserie',    label: 'Menuiserie',      emoji: '🪚', color: 'bg-amber-50  border-amber-200  hover:border-amber-400'  },
  { slug: 'climatisation', label: 'Climatisation',   emoji: '❄️', color: 'bg-sky-50    border-sky-200    hover:border-sky-400'    },
  { slug: 'peinture',      label: 'Peinture',        emoji: '🎨', color: 'bg-pink-50   border-pink-200   hover:border-pink-400'   },
  { slug: 'jardinage',     label: 'Jardinage',       emoji: '🌿', color: 'bg-green-50  border-green-200  hover:border-green-400'  },
  { slug: 'nettoyage',     label: 'Nettoyage',       emoji: '🧹', color: 'bg-purple-50 border-purple-200 hover:border-purple-400' },
  { slug: 'informatique',  label: 'Informatique',    emoji: '💻', color: 'bg-indigo-50 border-indigo-200 hover:border-indigo-400' },
];

const STATS = [
  { value: '2 000+', label: 'Prestataires vérifiés' },
  { value: '15 000+', label: 'Clients satisfaits'   },
  { value: '98%',    label: 'Taux de satisfaction'  },
];

export default function Home() {
  const { t }      = useTranslation();
  const navigate   = useNavigate();
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green-700 via-green-600 to-green-800 text-white">
        {/* Cercles décoratifs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-orange-400/10 pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-4 py-20 sm:py-28 text-center">
          {/* Badge */}
          <span className="inline-flex items-center gap-1.5 bg-white/15 text-white/90 text-xs font-semibold px-3 py-1 rounded-full mb-6 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            Disponible au Sénégal · Côte d'Ivoire · Mali
          </span>

          <div className="flex justify-center mb-5">
            <Logo size="lg" variant="white" />
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-5 leading-tight">
            {t('app.tagline', 'Trouvez le bon professionnel,')}<br />
            <span className="text-orange-300">en quelques secondes</span>
          </h1>
          <p className="text-green-100 text-lg sm:text-xl mb-10 max-w-2xl mx-auto">
            Plombiers, électriciens, menuisiers… Des prestataires vérifiés et notés, près de chez vous.
          </p>

          {/* Barre de recherche */}
          <form onSubmit={handleSearch} className="flex gap-2 max-w-2xl mx-auto" role="search">
            <div className="relative flex-1">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Plombier, électricien, menuisier…"
                className="w-full pl-12 pr-4 py-4 rounded-xl text-gray-900 text-base bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
                aria-label="Rechercher un service"
              />
            </div>
            <button type="submit" className="px-8 py-4 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold rounded-xl shadow-lg transition-colors whitespace-nowrap">
              Chercher
            </button>
          </form>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <section className="bg-gray-900 text-white py-10">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-3 gap-4 text-center">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-extrabold text-green-400">{s.value}</p>
              <p className="text-gray-400 text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Catégories ─────────────────────────────────────────── */}
      <section className="py-16 px-4 max-w-5xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 text-center">
          Nos services
        </h2>
        <p className="text-gray-500 text-center mb-10">Cliquez sur un service pour trouver des professionnels disponibles</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => navigate(`/search?category=${cat.slug}`)}
              className={`rounded-2xl border-2 flex flex-col items-center gap-3 py-6 px-3
                         transition-all duration-200 cursor-pointer group shadow-sm hover:shadow-md ${cat.color}`}
            >
              <span className="text-4xl group-hover:scale-110 transition-transform duration-200" aria-hidden="true">
                {cat.emoji}
              </span>
              <span className="font-semibold text-gray-800 text-sm text-center">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Comment ça marche ──────────────────────────────────── */}
      <section className="bg-gradient-to-br from-gray-50 to-green-50 py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 text-center">
            Comment ça marche ?
          </h2>
          <p className="text-gray-500 text-center mb-12">Simple, rapide et sécurisé</p>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Recherchez',  desc: 'Trouvez un prestataire par service et localisation', emoji: '🔍', color: 'text-green-600 bg-green-100'  },
              { step: '02', title: 'Réservez',    desc: 'Choisissez votre créneau et confirmez en ligne',     emoji: '📅', color: 'text-orange-600 bg-orange-100' },
              { step: '03', title: 'Payez',       desc: 'Payez via Wave, Orange Money ou carte bancaire',     emoji: '💰', color: 'text-blue-600 bg-blue-100'    },
            ].map((item) => (
              <div key={item.step} className="relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center group hover:shadow-md transition-shadow">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {item.step}
                </span>
                <div className={`w-14 h-14 rounded-2xl ${item.color} flex items-center justify-center mx-auto mb-4 text-2xl`}>
                  {item.emoji}
                </div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Prestataire ────────────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto bg-gradient-to-br from-green-700 to-green-800 rounded-3xl p-10 text-center text-white shadow-xl">
          <span className="text-5xl mb-4 block">🛠️</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">
            Vous êtes prestataire ?
          </h2>
          <p className="text-green-100 mb-8 text-lg">
            Rejoignez BLA Services et développez votre clientèle.<br />
            Inscription gratuite, commissions transparentes.
          </p>
          <button
            onClick={() => navigate('/register?role=provider')}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-4 rounded-xl text-lg transition-colors shadow-lg"
          >
            Rejoindre BLA
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-gray-400 py-10 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="sm" variant="white" />
          <p className="text-sm">© {new Date().getFullYear()} BLA Services. Tous droits réservés.</p>
          <div className="flex gap-4 text-sm">
            <a href="#" className="hover:text-white transition-colors">Confidentialité</a>
            <a href="#" className="hover:text-white transition-colors">CGU</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
