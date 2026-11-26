import { useEffect, useState, type ReactNode } from 'react';

const control = 'rounded-lg border border-white/10 bg-[#1a2744] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500';

/** Barre de filtres responsive (une colonne sur mobile). */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">{children}</div>;
}

/** Recherche avec temporisation (évite une requête par frappe). */
export function SearchInput({ value, onChange, placeholder, label = 'Rechercher' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    const t = setTimeout(() => { if (draft !== value) onChange(draft); }, 350);
    return () => clearTimeout(t);
  }, [draft, value, onChange]);
  return (
    <label className="flex-1 sm:max-w-xs">
      <span className="sr-only">{label}</span>
      <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder ?? `${label}…`} className={`${control} w-full`} />
    </label>
  );
}

export function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="text-xs text-gray-400">
      <span className="mb-1 block">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={control}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-gray-400">
      <span className="mb-1 block">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={control} />
    </label>
  );
}
