# Tableau de bord Administrateur — BLA

## 1. Rôles et permissions

| Rôle | Permissions |
|------|-------------|
| `super_admin` | Accès total, gestion des admins |
| `admin` | Modération, vérification identités, litiges |
| `support` | Consultation uniquement, gestion signalements |
| `finance` | Transactions, commissions, remboursements |

---

## 2. Interface admin — Vue d'ensemble

### 2.1 Dashboard principal
```
Indicateurs clés (KPI) — période sélectionnable (jour/semaine/mois/année)
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Utilisateurs │  │ Prestataires │  │ Réservations │  │ Revenus      │
│ 15 230 (+8%) │  │  9 845 (+5%) │  │  4 102 (+12%)│  │ 6.2M XOF     │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘

Alertes urgentes
⚠  14 pièces d'identité en attente de vérification     [Traiter]
⚠  8 signalements non résolus (+2 aujourd'hui)          [Voir]
⚠  3 litiges de paiement ouverts                        [Traiter]

Graphiques
• Courbe des inscriptions (30 derniers jours)
• Répartition des services (camembert par catégorie)
• Carte thermique des zones d'activité
• Taux de complétion des réservations
```

### 2.2 Gestion des utilisateurs
```
Filtres : [Rôle ▾] [Statut ▾] [Pays ▾] [Vérifié ▾] [Recherche...]

┌──────────────────────────────────────────────────────────────────────┐
│ Photo │ Nom              │ Rôle       │ Statut  │ Inscrit   │ Actions│
├──────────────────────────────────────────────────────────────────────┤
│  👤   │ Moussa Diallo    │ Prestataire│ ✅ Actif │ 12/01/26  │ 👁 ✏ │
│  👤   │ Fatou Ndiaye     │ Client     │ ⏳ Attente│ 28/03/26  │ 👁 ✏ │
│  👤   │ Ibrahima Sow     │ Prestataire│ 🔴 Suspendu│ 05/02/26│ 👁 ✏ │
└──────────────────────────────────────────────────────────────────────┘

Actions disponibles sur un utilisateur :
- Voir le profil complet
- Modifier les informations
- Changer le statut (actif/suspendu/banni)
- Vérifier/rejeter la pièce d'identité
- Voir l'historique des transactions
- Voir les signalements émis/reçus
- Réinitialiser le mot de passe
- Supprimer le compte (soft delete)
```

### 2.3 Vérification des identités
```
Interface de vérification
┌─────────────────────────────────────────────────────────────┐
│ ← Vérification identité — Moussa Diallo                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Profil déclaré          Pièce d'identité                   │
│  ─────────────           ─────────────                      │
│  Nom : Diallo            [  Image recto  ] [  Image verso  ]│
│  Prénom : Moussa         (zoom, rotation disponibles)       │
│  Naissance : 12/05/1990                                     │
│  Téléphone : +221 77 xxx                                    │
│                                                             │
│  Vérification manuelle :                                    │
│  ☐ Le nom correspond                                        │
│  ☐ La photo correspond                                      │
│  ☐ La pièce n'est pas expirée                              │
│  ☐ La pièce est lisible                                     │
│                                                             │
│  Commentaire (optionnel) :                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [  ❌ Rejeter  ]                      [  ✅ Valider  ]    │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Modération des avis
```
Filtres : [En attente] [Signalés] [Tous]

┌─────────────────────────────────────────────────────────────────┐
│ Avis de Ibou Diouf sur Électricien Traoré Samba                │
│ ⭐ 1/5 — 28/03/2026                                             │
│ "Ce prestataire m'a arnaqué ! Il a pris l'argent sans finir..." │
│                                                                 │
│ Score de confiance IA : 🟡 Moyen (62%)                          │
│ Raison d'alerte : Avis posté 2min après fin de mission          │
│                                                                 │
│ [  🗑 Supprimer  ]  [  ✅ Approuver  ]  [  🔍 Enquêter  ]       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.5 Gestion des litiges
```
┌─────────────────────────────────────────────────────────────────┐
│ Litige #2847 — Booking #BB-1234                                 │
│ Client : Aissatou Mbaye         Prestataire : Moussa Koné       │
│ Montant en séquestre : 25 000 XOF                               │
│ Ouvert le : 27/03/2026                                          │
│                                                                 │
│ Description du client :                                         │
│ "Le travail n'a pas été terminé, il manque la finition..."      │
│                                                                 │
│ Réponse du prestataire :                                        │
│ "J'ai terminé le travail demandé, le client rajoute des..."     │
│                                                                 │
│ Photos fournies : [Photo 1] [Photo 2] [Photo 3]                 │
│                                                                 │
│ Historique GPS : ✅ Prestataire présent 2h45                    │
│                                                                 │
│ Décision :                                                      │
│ ○ Remboursement total au client (100%)                          │
│ ○ Remboursement partiel : [____] %                              │
│ ● Paiement total au prestataire                                 │
│                                                                 │
│ Note admin :                                                     │
│ [_______________________________________]                        │
│                                                                 │
│ [  Appliquer la décision  ]                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Gestion des commissions et finances

```typescript
// Rapport financier mensuel
interface FinancialReport {
  period: { from: Date; to: Date };
  totalTransactions: number;
  totalVolume: number;          // XOF
  totalCommissions: number;     // XOF
  averageCommissionRate: number;// %
  refundedAmount: number;       // XOF
  netRevenue: number;           // XOF
  topCategories: {
    category: string;
    volume: number;
    count: number;
  }[];
  topProviders: {
    provider: string;
    volume: number;
    commissions: number;
  }[];
}
```

---

## 4. Gestion des catégories de services

```
Catégories actives (10)
┌─────────────────────────────────────────────────────┐
│ 🔧 Plomberie        | 245 prestataires | ✅ Active   │
│ ⚡ Électricité       | 312 prestataires | ✅ Active   │
│ 🪚 Menuiserie       | 178 prestataires | ✅ Active   │
│ ❄️  Climatisation    | 89  prestataires | ✅ Active   │
│ 🎨 Peinture         | 203 prestataires | ✅ Active   │
│ + Ajouter catégorie │
└─────────────────────────────────────────────────────┘
```

---

## 5. Statistiques et exports

- Export CSV/Excel de tous les rapports
- Rapports automatiques hebdomadaires par email
- API analytics pour intégration externe
- Métriques de satisfaction (NPS, taux de complétion, taux de litige)
