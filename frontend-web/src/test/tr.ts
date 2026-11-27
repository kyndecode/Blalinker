/**
 * Texte français d'une clé de traduction, pour écrire des assertions sur ce que voit
 * l'utilisateur sans recopier les libellés (une reformulation ne casse pas les tests).
 */
import fr from '../i18n/fr.json';

export function tr(key: string): string {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], fr);
  if (typeof value !== 'string') throw new Error(`Clé de traduction absente : ${key}`);
  return value;
}

/**
 * Même texte sous forme d'expression régulière : début du libellé (un astérisque « requis »
 * peut suivre), insensible à la casse, caractères échappés. Ancré pour que « Nom » ne
 * désigne pas aussi « Prénom ».
 */
export function trRx(key: string): RegExp {
  return new RegExp(`^${tr(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
}
