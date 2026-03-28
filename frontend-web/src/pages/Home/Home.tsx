import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const CATEGORIES = [
  { slug: 'plomberie',    label: 'Plomberie',     emoji: '🔧' },
  { slug: 'electricite',  label: 'Électricité',    emoji: '⚡' },
  { slug: 'menuiserie',   label: 'Menuiserie',     emoji: '🪚' },
  { slug: 'climatisation',label: 'Climatisation',  emoji: '❄️' },
  { slug: 'peinture',     label: 'Peinture',       emoji: '🎨' },
  { slug: 'jardinage',    label: 'Jardinage',      emoji: '🌿' },
  { slug: 'nettoyage',    label: 'Nettoyage',      emoji: '🧹' },
  { slug: 'informatique', label: 'Informatique',   emoji: '💻' },
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
    <div className="min-h-screen">
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-600 to-primary-800 text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            {t('app.tagline')}
          </h1>
          <p className="text-primary-100 text-lg mb-8">
            Plombiers, électriciens, menuisiers... Trouvez des professionnels vérifiés près de chez vous.
          </p>

          {/* Barre de recherche */}
          <form onSubmit={handleSearch} className="flex gap-2 max-w-xl mx-auto" role="search">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              className="flex-1 input text-gray-900 rounded-xl py-3 text-base"
              aria-label={t('search.title')}
            />
            <button type="submit" className="btn-primary rounded-xl px-6 py-3 text-base">
              Chercher
            </button>
          </form>
        </div>
      </section>

      {/* Catégories */}
      <section className="py-12 px-4 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Nos services
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => navigate(`/search?category=${cat.slug}`)}
              className="card flex flex-col items-center gap-2 py-5 hover:border-primary-400 hover:shadow-md transition-all duration-200 cursor-pointer group"
            >
              <span className="text-4xl group-hover:scale-110 transition-transform duration-200" aria-hidden="true">
                {cat.emoji}
              </span>
              <span className="font-medium text-gray-700 text-sm text-center">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="bg-gray-50 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Comment ça marche ?
          </h2>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Recherchez', desc: 'Trouvez un prestataire par service et localisation', emoji: '🔍' },
              { step: '2', title: 'Réservez',   desc: 'Choisissez votre créneau et confirmez la réservation', emoji: '📅' },
              { step: '3', title: 'Payez',      desc: 'Payez en toute sécurité via Mobile Money après le travail', emoji: '💰' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4 text-3xl">
                  {item.emoji}
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Prestataire */}
      <section className="py-12 px-4 text-center">
        <div className="max-w-lg mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Vous êtes prestataire ?
          </h2>
          <p className="text-gray-600 mb-6">
            Rejoignez BLA et développez votre clientèle. Inscription gratuite, commissons transparentes.
          </p>
          <button
            onClick={() => navigate('/register?role=provider')}
            className="btn-primary text-lg px-8 py-3"
          >
            Rejoindre BLA
          </button>
        </div>
      </section>
    </div>
  );
}
