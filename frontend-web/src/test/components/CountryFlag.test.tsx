/**
 * Drapeaux — non-régression de l'audit du 25/11/2026.
 * Cause : émojis-drapeaux (🇹🇬) affichés en lettres (« TG ») sous Windows, qui n'a aucun
 * glyphe de drapeau. Correctif : images SVG (CountryFlag) partout, jamais d'émoji-drapeau.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import CountryFlag, { flagUrl } from '../../components/common/CountryFlag';
import ServedCountries, { DEFAULT_SERVED_COUNTRIES } from '../../components/common/ServedCountries';
import PhoneCountrySelect from '../../components/common/PhoneCountrySelect';
import { getCountryOptions } from '../../utils/phoneCountries';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('../../services/api', () => ({ default: { get: getMock } }));

const REGIONAL_INDICATOR = /[\u{1F1E6}-\u{1F1FF}]/u;

function withQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('CountryFlag', () => {
  it('image SVG au format 4:3 pour un code connu (insensible à la casse)', () => {
    expect(flagUrl('TG')).toBeTruthy();
    expect(flagUrl('ci')).toBe(flagUrl('CI'));
    const { container } = render(<CountryFlag code="SN" size="lg" />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('width', '32');
    expect(img).toHaveAttribute('height', '24');
    expect(img).toHaveAttribute('alt', ''); // décoratif : le nom du pays est écrit à côté
  });

  it('nom accessible quand le drapeau est seul', () => {
    render(<CountryFlag code="ML" label="Mali" />);
    expect(screen.getByRole('img', { name: 'Mali' })).toBeInTheDocument();
  });

  it('code inconnu ou invalide : emplacement neutre de même taille, aucune erreur', () => {
    expect(flagUrl('ZZZ')).toBeUndefined();
    const { container } = render(<CountryFlag code="??" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstChild).toHaveClass('w-5');
  });
});

describe('ServedCountries', () => {
  it('sans pays actif dans l’administration : liste historique (TG, CI, ML, BF) avec drapeaux et noms', async () => {
    getMock.mockResolvedValue({ data: { items: [] } });
    const { container } = withQuery(<ServedCountries />);
    await waitFor(() => expect(container.querySelectorAll('img[data-country]')).toHaveLength(DEFAULT_SERVED_COUNTRIES.length));
    expect(container.textContent).not.toMatch(REGIONAL_INDICATOR);
    expect(container.textContent).toMatch(/Togo/);
  });

  it('pays actifs de l’administration : affichés à la place de la liste historique', async () => {
    getMock.mockResolvedValue({ data: { items: [{ code: 'SN', name: 'Sénégal', dialCode: '221', currency: 'XOF', defaultLocale: 'fr' }] } });
    const { container } = withQuery(<ServedCountries />);
    await waitFor(() => expect(container.querySelector('img[data-country="SN"]')).not.toBeNull());
    expect(container.querySelectorAll('img[data-country]')).toHaveLength(1);
  });
});

describe('PhoneCountrySelect', () => {
  it('options « Pays (+indicatif) » sans émoji ; drapeau du pays choisi en image', () => {
    const countries = getCountryOptions('fr').filter((c) => ['TG', 'CI', 'FR'].includes(c.code));
    const { container } = render(
      <PhoneCountrySelect aria-label="Indicatif pays" countries={countries} selectedCode="TG" placeholder="Choisissez" defaultValue="TG" />,
    );
    const options = [...container.querySelectorAll('option')].map((o) => o.textContent ?? '');
    expect(options.join(' ')).not.toMatch(REGIONAL_INDICATOR);
    expect(options).toContain('Togo (+228)');
    expect(container.querySelector('img[data-country="TG"]')).not.toBeNull();
  });
});

describe('garde-fou : aucun émoji-drapeau dans le code du site', () => {
  it('src/ (hors tests) ne contient aucun indicateur régional Unicode', () => {
    // Contenu brut des sources, lu par Vite (aucune dépendance aux API Node).
    const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx,json,css}', '!/src/test/**'], {
      query: '?raw', import: 'default', eager: true,
    });
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const offenders = Object.entries(sources).filter(([, text]) => REGIONAL_INDICATOR.test(text)).map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
