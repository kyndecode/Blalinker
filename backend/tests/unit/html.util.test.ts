// Vérifie l'échappement HTML des emails (anti-injection — correctif S9).
import { escapeHtml, escapeHtmlMultiline } from '../../src/utils/html.util';

describe('escapeHtml', () => {
  it('échappe les caractères dangereux', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;&#x2F;script&gt;');
    expect(escapeHtml('a & b "c" \'d\'')).toBe('a &amp; b &quot;c&quot; &#39;d&#39;');
  });

  it('gère null/undefined sans planter', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapeHtmlMultiline convertit les sauts de ligne en <br/> après échappement', () => {
    expect(escapeHtmlMultiline('ligne1\nligne2')).toBe('ligne1<br/>ligne2');
    expect(escapeHtmlMultiline('<b>\n</b>')).toBe('&lt;b&gt;<br/>&lt;&#x2F;b&gt;');
  });
});
