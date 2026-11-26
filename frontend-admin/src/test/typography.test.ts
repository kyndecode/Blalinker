/**
 * Typographie : aucun long tiret (U+2014) ni tiret moyen (U+2013) dans l'administration,
 * titre de l'onglet compris. Demande du 25/11/2026. Code source hors tests + index.html.
 */
import { describe, expect, it } from 'vitest';

const LONG_DASH = /[–—]/;

describe('aucun long tiret dans l’administration', () => {
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
