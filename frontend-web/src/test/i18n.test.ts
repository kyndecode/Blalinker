/**
 * Langues : français et anglais uniquement (wolof retiré à la demande du propriétaire).
 * Les deux fichiers doivent avoir exactement les mêmes clés (aucun texte manquant).
 */
import { describe, expect, it } from 'vitest';
import fr from '../i18n/fr.json';
import en from '../i18n/en.json';

const files = import.meta.glob('../i18n/*.json');

function keys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('traductions', () => {
  it('seuls fr.json et en.json existent (aucun wolof)', () => {
    expect(Object.keys(files).map((f) => f.split('/').pop()).sort()).toEqual(['en.json', 'fr.json']);
  });

  it('français et anglais ont les mêmes clés', () => {
    const frKeys = keys(fr).sort();
    const enKeys = keys(en).sort();
    expect(frKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !frKeys.includes(k))).toEqual([]);
  });

  it('aucun texte vide', () => {
    for (const [name, data] of [['fr', fr], ['en', en]] as const) {
      const empty = keys(data).filter((k) => {
        const v = k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], data);
        return typeof v === 'string' && !v.trim();
      });
      expect({ name, empty }).toEqual({ name, empty: [] });
    }
  });
});
