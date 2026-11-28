/**
 * Création d'un membre de l'équipe (contre-audit du 28/11/2026) : l'option « Personnalisé »
 * (aucun rôle prédéfini) arrive vide depuis l'administration et était refusée avec un message
 * technique anglais : aucun membre ne pouvait être créé sans rôle prédéfini.
 */
import { createAdminSchema, updateAdminSchema } from '../../src/modules/admin/team.schemas';

const base = { email: 'Awa@Example.test', password: 'Essai-Equipe2026', firstName: 'Awa', lastName: 'Koné' };

describe('schéma de création d’un membre de l’équipe', () => {
  it('« Personnalisé » (rôle prédéfini vide) : accepté, traité comme absent', () => {
    const r = createAdminSchema.safeParse({ ...base, preset: '', permissions: ['users.read'] });
    expect(r.success).toBe(true);
    expect(r.success && r.data.preset).toBeUndefined();
    expect(r.success && r.data.email).toBe('awa@example.test');
    expect(updateAdminSchema.safeParse({ preset: '' }).success).toBe(true);
  });

  it('rôle prédéfini inconnu : refus en français', () => {
    const r = createAdminSchema.safeParse({ ...base, preset: 'inconnu' });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0].message).toBe('Rôle prédéfini inconnu.');
  });

  it('messages en français pour le mot de passe et les noms (zod renvoyait sinon de l’anglais)', () => {
    const r = createAdminSchema.safeParse({ ...base, password: 'court', firstName: 'A', lastName: '' });
    expect(r.success).toBe(false);
    const messages = !r.success ? r.error.issues.map((i) => i.message) : [];
    expect(messages).toEqual(expect.arrayContaining([
      'Mot de passe : 10 caractères minimum.',
      'Mot de passe : ajoutez au moins une majuscule.',
      'Prénom : 2 caractères minimum.',
      'Nom : 2 caractères minimum.',
    ]));
    expect(messages.join(' ')).not.toMatch(/Too small|Invalid|expected/i);
  });
});
