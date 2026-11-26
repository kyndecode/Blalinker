import { forwardRef, type SelectHTMLAttributes } from 'react';
import CountryFlag from './CountryFlag';
import type { CountryOption } from '../../utils/phoneCountries';

interface PhoneCountrySelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  countries: CountryOption[];
  /** Pays actuellement choisi : son drapeau (image SVG) s'affiche dans le champ. */
  selectedCode?: string;
  placeholder: string;
  hasError?: boolean;
}

/**
 * Choix du pays de l'indicatif téléphonique.
 *
 * Liste native (accessible, sélecteur natif sur mobile) dont les options ne contiennent
 * plus d'émoji-drapeau (illisible sous Windows) ; le drapeau du pays choisi est une image
 * placée dans le champ. Options « Pays (+indicatif) » : la saisie au clavier d'une lettre
 * amène directement au pays.
 */
const PhoneCountrySelect = forwardRef<HTMLSelectElement, PhoneCountrySelectProps>(function PhoneCountrySelect(
  { countries, selectedCode, placeholder, hasError, className = '', ...selectProps },
  ref,
) {
  return (
    <div className="relative min-w-0">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex" aria-hidden="true">
        {selectedCode
          ? <CountryFlag code={selectedCode} size="md" />
          : <span className="w-5 h-[15px] rounded-[2px] bg-gray-200 dark:bg-gray-700" />}
      </span>
      <select
        ref={ref}
        className={`input w-full pl-11 ${hasError ? 'input-error' : ''} ${className}`}
        {...selectProps}
      >
        <option value="" disabled>{placeholder}</option>
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.dialCode ? `${country.name} (+${country.dialCode})` : country.name}
          </option>
        ))}
      </select>
    </div>
  );
});

export default PhoneCountrySelect;
