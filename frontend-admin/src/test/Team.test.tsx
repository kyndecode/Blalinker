import { describe, expect, it } from 'vitest';
import { passwordIssues } from '../pages/Team';

describe('réinitialisation de mot de passe (équipe)', () => {
  it('même règle que le serveur, saisie masquée (plus de prompt du navigateur)', () => {
    expect(passwordIssues('court')).toEqual(['10 caractères minimum', 'une majuscule', 'un chiffre']);
    expect(passwordIssues('sansmajuscule1')).toEqual(['une majuscule']);
    expect(passwordIssues('Correct-Horse9')).toEqual([]);
  });
});
