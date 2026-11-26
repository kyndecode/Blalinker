import { csvCell, dateRange, sortOrder, toCsv } from '../../src/modules/admin/insights.controller';

describe('export CSV', () => {
  it('neutralise les formules (injection CSV)', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell('+33 1 23')).toBe("'+33 1 23");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('séparateur « ; », guillemets, sauts de ligne, valeurs vides, dates', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "bonjour"')).toBe('"dit ""bonjour"""');
    expect(csvCell('ligne1\nligne2')).toBe('"ligne1\nligne2"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(new Date('2026-11-25T10:00:00.000Z'))).toBe('2026-11-25T10:00:00.000Z');
  });

  it('BOM UTF-8 (tableurs) et fins de ligne CRLF', () => {
    const csv = toCsv(['nom', 'ville'], [['Awa', 'Dakar'], ['Koffi', 'Abidjan']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('nom;ville\r\nAwa;Dakar\r\nKoffi;Abidjan\r\n');
  });
});

describe('filtres de liste', () => {
  it('tri limité à une liste blanche', () => {
    expect(sortOrder('amount:asc', ['createdAt', 'amount'] as const, 'createdAt')).toEqual({ amount: 'asc' });
    expect(sortOrder('passwordHash:asc', ['createdAt', 'amount'] as const, 'createdAt')).toEqual({ createdAt: 'asc' });
    expect(sortOrder(undefined, ['createdAt'] as const, 'createdAt')).toEqual({ createdAt: 'desc' });
  });

  it('période : date de fin incluse jusqu’à 23:59:59.999', () => {
    const r = dateRange({ from: '2026-11-01', to: '2026-11-30' })!;
    expect(r.gte?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(r.lte?.toISOString()).toBe('2026-11-30T23:59:59.999Z');
    expect(dateRange({ from: 'pas une date' })).toBeUndefined();
  });
});
