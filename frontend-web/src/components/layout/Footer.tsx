import { Link } from 'react-router-dom';
import Logo from '../common/Logo';

/* Dimensions fixes sur les SVG — évite l'affichage plein-page si Tailwind purge w-4/h-4 */
const I = { width: 18, height: 18, fill: 'currentColor' as const, style: { display: 'block', flexShrink: 0 } };

const SOCIAL = [
  { name: 'Facebook',  href: '#', icon: <svg {...I} viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg> },
  { name: 'Twitter/X', href: '#', icon: <svg {...I} viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
  { name: 'Instagram', href: '#', icon: <svg {...I} viewBox="0 0 24 24"><path d="M12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg> },
  { name: 'WhatsApp',  href: '#', icon: <svg {...I} viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> },
];

export default function Footer() {
  return (
    <footer className="bg-[#1a2744] text-gray-400">

      {/* ─── Colonnes principales ─────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* 1 — Marque */}
          <div className="space-y-4">
            <Logo size="sm" variant="white" />
            <p className="text-sm text-white/50 font-medium">
              Votre plateforme de services à domicile
            </p>
            <p className="text-sm text-white/40 leading-relaxed">
              Connectez-vous aux meilleurs prestataires vérifiés et certifiés autour de vous, au Sénégal et en Afrique de l'Ouest.
            </p>
            <div>
              <p className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-3">
                Suivez-nous
              </p>
              <div className="flex items-center gap-2">
                {SOCIAL.map((s) => (
                  <a
                    key={s.name}
                    href={s.href}
                    aria-label={s.name}
                    className="w-9 h-9 rounded-lg bg-white/10 hover:bg-green-600 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* 2 — Navigation */}
          <div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-5">
              Navigation
            </h4>
            <ul className="space-y-3">
              {[
                { label: 'Accueil',             to: '/'                       },
                { label: 'Rechercher',           to: '/search'                 },
                { label: 'Devenir prestataire',  to: '/register?role=provider' },
                { label: 'À propos',             to: '/about'                  },
                { label: 'Contact',              to: '/contact'                },
                { label: 'FAQ',                  to: '/help'                   },
              ].map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="text-sm text-white/50 hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 3 — Légal */}
          <div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-5">
              Légal
            </h4>
            <ul className="space-y-3">
              {[
                { label: 'Mentions légales',            to: '/terms'   },
                { label: 'Politique de confidentialité', to: '/privacy' },
                { label: 'Conditions générales',        to: '/terms'   },
              ].map((item) => (
                <li key={item.label}>
                  <Link to={item.to} className="text-sm text-white/50 hover:text-white transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Paiements */}
            <div className="mt-8">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-3">
                Paiements acceptés
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['Wave', 'Orange Money', 'Free Money', 'Stripe'].map((p) => (
                  <span key={p} className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/50 border border-white/10">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 4 — Contact */}
          <div>
            <h4 className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-5">
              Contact
            </h4>
            <ul className="space-y-4">
              <li>
                <p className="text-xs text-white/40 mb-0.5">Email :</p>
                <a href="mailto:contact@blaservices.com" className="text-sm text-white/70 hover:text-white transition-colors">
                  contact@blaservices.com
                </a>
              </li>
              <li>
                <p className="text-xs text-white/40 mb-0.5">Téléphone :</p>
                <a href="tel:+221338001234" className="text-sm text-white/70 hover:text-white transition-colors">
                  +221 33 800 12 34
                </a>
              </li>
              <li>
                <p className="text-xs text-white/40 mb-0.5">Disponible dans :</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {['🇸🇳', '🇨🇮', '🇲🇱', '🇧🇫', '🇬🇳'].map((flag) => (
                    <span key={flag} className="text-lg" title="Disponible dans ce pays">{flag}</span>
                  ))}
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ─── Barre de bas de page ─────────────────────────────── */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-white/30">
            © {new Date().getFullYear()} BLA Services — Tous droits réservés.
          </p>
          <p className="text-xs text-white/30">Made with 💚 for Africa</p>
        </div>
      </div>
    </footer>
  );
}
