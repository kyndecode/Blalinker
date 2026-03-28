import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '../common/Logo';
import { useThemeStore } from '../../store/themeStore';

const SOCIAL = [
  {
    name: 'Facebook', href: '#',
    icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
  {
    name: 'Twitter/X', href: '#',
    icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  },
  {
    name: 'Instagram', href: '#',
    icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
  },
  {
    name: 'WhatsApp', href: '#',
    icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
  },
];

export default function Footer() {
  const { t } = useTranslation();
  const { isDark } = useThemeStore();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleNewsletter = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) { setSubscribed(true); setEmail(''); }
  };

  return (
    <footer className="bg-gray-900 dark:bg-gray-950 text-gray-400 border-t border-gray-800">
      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10">

          {/* Brand */}
          <div className="lg:col-span-2 space-y-5">
            <Logo size="sm" variant="white" />
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
              {t('footer.tagline')} — Connectez-vous aux meilleurs prestataires certifiés autour de vous.
            </p>
            {/* Réseaux sociaux */}
            <div className="flex items-center gap-3">
              {SOCIAL.map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  aria-label={s.name}
                  className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-green-600 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                >
                  {s.icon}
                </a>
              ))}
            </div>
            {/* Newsletter */}
            <div>
              <p className="text-sm font-semibold text-white mb-1">{t('footer.newsletter_title')}</p>
              <p className="text-xs text-gray-500 mb-3">{t('footer.newsletter_sub')}</p>
              {subscribed ? (
                <p className="text-xs text-green-400 font-medium">✓ Merci pour votre inscription !</p>
              ) : (
                <form onSubmit={handleNewsletter} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('footer.newsletter_placeholder')}
                    className="flex-1 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button type="submit" className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap">
                    {t('footer.newsletter_btn')}
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">{t('footer.company')}</h4>
            <ul className="space-y-2.5">
              {[
                { label: t('footer.about'),    to: '/about'   },
                { label: t('footer.careers'),  to: '/careers' },
                { label: t('footer.blog'),     to: '/blog'    },
              ].map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="text-sm hover:text-green-400 transition-colors">{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services + Support */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">{t('footer.services')}</h4>
            <ul className="space-y-2.5 mb-6">
              {[
                { label: t('footer.browse'),     to: '/search'     },
                { label: t('footer.categories'), to: '/search'     },
                { label: t('nav.become_provider'), to: '/register?role=provider' },
              ].map((item) => (
                <li key={item.label}>
                  <Link to={item.to} className="text-sm hover:text-green-400 transition-colors">{item.label}</Link>
                </li>
              ))}
            </ul>
            <h4 className="text-white font-semibold text-sm mb-4">{t('footer.support')}</h4>
            <ul className="space-y-2.5">
              {[
                { label: t('footer.help'),    to: '/help'    },
                { label: t('footer.contact'), to: '/contact' },
              ].map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="text-sm hover:text-green-400 transition-colors">{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">{t('footer.legal')}</h4>
            <ul className="space-y-2.5">
              {[
                { label: t('footer.terms'),   to: '/terms'   },
                { label: t('footer.privacy'), to: '/privacy' },
              ].map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="text-sm hover:text-green-400 transition-colors">{item.label}</Link>
                </li>
              ))}
            </ul>

            {/* Badges paiement */}
            <div className="mt-6 space-y-2">
              <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Paiements acceptés</p>
              {['Wave', 'Orange Money', 'Free Money', 'Stripe'].map((p) => (
                <span key={p} className="inline-block mr-1 mb-1 px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-400">{p}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} BLA Services. {t('footer.copyright')}
          </p>
          <div className="flex items-center gap-1">
            {['🇸🇳', '🇨🇮', '🇲🇱', '🇧🇫', '🇬🇳'].map((flag) => (
              <span key={flag} className="text-base" title="Disponible dans ce pays">{flag}</span>
            ))}
          </div>
          <p className="text-xs text-gray-600">Made with 💚 for Africa</p>
        </div>
      </div>
    </footer>
  );
}
