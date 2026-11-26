import {
  adminPersonSelect,
  adminUserScalarSelect,
  coarseCoordinate,
  coarseDistanceKm,
  ownAccountSelect,
  publicPersonSelect,
  publicProfileSelect,
  publicProviderProfileSelect,
  toPublicPerson,
} from '../../src/utils/serializers';

const FORBIDDEN_EVERYWHERE = ['passwordHash', 'mfaSecret', 'mfaTotpLastStep', 'loginAttempts', 'permissions'];

describe('listes blanches de champs', () => {
  it.each([
    ['publicPersonSelect', publicPersonSelect],
    ['adminPersonSelect', adminPersonSelect],
    ['adminUserScalarSelect', adminUserScalarSelect],
    ['ownAccountSelect', ownAccountSelect],
  ])('%s ne sélectionne jamais de secret', (_name, select) => {
    for (const key of FORBIDDEN_EVERYWHERE) expect(select).not.toHaveProperty(key);
  });

  it('le public ne voit ni e-mail ni téléphone', () => {
    expect(publicPersonSelect).not.toHaveProperty('email');
    expect(publicPersonSelect).not.toHaveProperty('phone');
  });

  it('profil public : ni adresse, ni coordonnées, ni pièce d’identité, ni date de naissance', () => {
    for (const key of ['address', 'latitude', 'longitude', 'idCardUrl', 'dateOfBirth']) {
      expect(publicProfileSelect).not.toHaveProperty(key);
    }
    expect(publicProviderProfileSelect).not.toHaveProperty('userId');
  });
});

describe('toPublicPerson', () => {
  it('expose le nom à plat et dans profile, sans autre donnée', () => {
    const person = toPublicPerson({ id: 'u1', role: 'client', profile: { firstName: 'Koffi', lastName: 'Yao', avatarUrl: null } });
    expect(person).toEqual({
      id: 'u1', role: 'client', firstName: 'Koffi', lastName: 'Yao', avatarUrl: null,
      profile: { firstName: 'Koffi', lastName: 'Yao', avatarUrl: null },
    });
  });

  it('tolère un profil absent', () => {
    expect(toPublicPerson({ id: 'u1', role: 'client', profile: null })).toMatchObject({ firstName: '', lastName: '' });
    expect(toPublicPerson(null)).toBeNull();
  });
});

describe('position publique arrondie', () => {
  it('coordonnées à 2 décimales (≈ 1 km)', () => {
    expect(coarseCoordinate(14.716677)).toBe(14.72);
    expect(coarseCoordinate('-17.467686')).toBe(-17.47);
    expect(coarseCoordinate(null)).toBeNull();
    expect(coarseCoordinate('abc')).toBeNull();
  });

  it('distance au demi-kilomètre, au moins 0,5 km', () => {
    expect(coarseDistanceKm(0.1)).toBe(0.5);
    expect(coarseDistanceKm(2.3)).toBe(2.5);
    expect(coarseDistanceKm(2.2)).toBe(2);
    expect(coarseDistanceKm('7.76')).toBe(8);
    expect(coarseDistanceKm(undefined)).toBeNull();
  });
});
