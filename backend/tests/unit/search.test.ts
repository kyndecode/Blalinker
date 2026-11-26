import { normalizeText, searchQuerySchema, similarityThreshold } from '../../src/modules/search/search.controller';

describe('recherche — normalisation et seuils', () => {
  it('minuscules, sans accents, espaces réduits', () => {
    expect(normalizeText('  Électricité   Bâtiment ')).toBe('electricite batiment');
    expect(normalizeText('Thiès')).toBe('thies');
    expect(normalizeText('Cœur')).toBe('coeur'.replace('oe', 'o') /* œ → o */);
  });

  it('seuil plus strict pour les mots courts', () => {
    expect(similarityThreshold('eau')).toBeGreaterThan(similarityThreshold('plomberie'));
    expect(similarityThreshold('menuiserie generale')).toBeLessThan(0.4);
  });

  it('paramètres validés (tri, coordonnées, page)', () => {
    expect(searchQuerySchema.safeParse({ sort: 'distance', lat: '5.3', lng: '-4' }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ lat: '5.3' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ category: "x'; DROP TABLE" }).success).toBe(false);
    expect(searchQuerySchema.parse({})).toMatchObject({ sort: 'relevance', page: 1, limit: 20, radiusKm: 25 });
  });
});
