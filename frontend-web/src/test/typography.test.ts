/**
 * Typographie : aucun long tiret (U+2014) ni tiret moyen (U+2013) sur le site, titres compris.
 * Demande du 25/11/2026. Vérifie le code source (hors tests) et index.html.
 */
import { describe, expect, it } from 'vitest';

const LONG_DASH = /[\u2013\u2014]/;

describe('aucun long tiret sur le site', () => {
  it('src/ (hors tests) et index.html', () => {
    const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx,json,css}', '/index.html', '!/src/test/**'], {
      query: '?raw', import: 'default', eager: true,
    });
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const offenders = Object.entries(sources)
      .flatMap(([file, text]) => text.split('\n').map((line, i) => ({ file, line: i + 1, text: line })))
      .filter((l) => LONG_DASH.test(l.text))
      .map((l) => `${l.file}:${l.line}`);
    expect(offenders).toEqual([]);
  });
});
