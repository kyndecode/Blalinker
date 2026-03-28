# Intelligence Artificielle & Recommandation — BLA

## 1. Vue d'ensemble des fonctionnalités IA

| Fonctionnalité | Technique | Bénéfice |
|----------------|-----------|----------|
| Recommandation de prestataires | Filtrage collaboratif + contenu | Matching précis client/prestataire |
| Score de qualité prestataire | ML multi-critères | Valoriser les bons prestataires |
| Détection de faux avis | NLP + règles comportementales | Lutter contre la fraude |
| Prédiction de disponibilité | Séries temporelles | Réduire les rendez-vous manqués |
| Estimation de prix dynamique | Régression | Tarifs justes et compétitifs |
| Détection de comportements frauduleux | Anomaly detection | Sécurité plateforme |
| Chatbot d'assistance | LLM (Claude API) | Support 24/7 en français/wolof |

---

## 2. Architecture du microservice IA

```
backend/
└── ai-service/                  # FastAPI Python
    ├── main.py
    ├── models/
    │   ├── recommender.py        # Modèle de recommandation
    │   ├── fraud_detector.py     # Détection fraude
    │   ├── review_scorer.py      # Scoring des avis
    │   └── price_estimator.py   # Estimation de prix
    ├── data/
    │   ├── preprocessor.py
    │   └── feature_engineering.py
    ├── training/
    │   └── train.py              # Scripts d'entraînement
    └── requirements.txt
```

---

## 3. Système de recommandation

### 3.1 Score de matching prestataire-client

```python
# ai-service/models/recommender.py
import numpy as np
from sklearn.preprocessing import MinMaxScaler

class ProviderRecommender:
    """
    Score composite pour classer les prestataires pour un client donné.
    """

    def score_provider(
        self,
        provider: dict,
        client_request: dict,
        distance_km: float
    ) -> float:
        """
        Retourne un score entre 0 et 1 pour un prestataire.
        """
        # 1. Pertinence géographique (30%)
        geo_score = self._geo_score(distance_km, client_request['max_radius_km'])

        # 2. Note et réputation (25%)
        reputation_score = self._reputation_score(
            provider['rating_average'],
            provider['rating_count'],
            provider['completed_jobs']
        )

        # 3. Correspondance de compétences (20%)
        skill_score = self._skill_match(
            provider['categories'],
            client_request['required_skills']
        )

        # 4. Disponibilité en temps réel (15%)
        availability_score = 1.0 if provider['is_available'] else 0.0

        # 5. Historique avec ce client (10%)
        history_score = self._history_score(
            provider['id'],
            client_request['client_id']
        )

        final_score = (
            geo_score          * 0.30 +
            reputation_score   * 0.25 +
            skill_score        * 0.20 +
            availability_score * 0.15 +
            history_score      * 0.10
        )

        return round(final_score, 4)

    def _geo_score(self, distance_km: float, max_radius: float) -> float:
        """Score inversement proportionnel à la distance."""
        if distance_km > max_radius:
            return 0.0
        return 1.0 - (distance_km / max_radius)

    def _reputation_score(self, rating: float, count: int, jobs: int) -> float:
        """Wilson score confidence interval pour noter la fiabilité."""
        if count == 0:
            return 0.5  # score neutre pour les nouveaux
        # Formule de Wilson (intervalle de confiance 95%)
        z = 1.96
        p = rating / 5.0
        n = count
        wilson = (
            (p + z*z/(2*n) - z * np.sqrt((p*(1-p) + z*z/(4*n))/n)) /
            (1 + z*z/n)
        )
        return wilson

    def _skill_match(self, provider_cats: list, required: list) -> float:
        if not required:
            return 1.0
        matches = len(set(provider_cats) & set(required))
        return matches / len(required)

    def _history_score(self, provider_id: str, client_id: str) -> float:
        # Score basé sur les interactions passées entre ce client et ce prestataire
        # (requête en base à implémenter)
        return 0.5
```

### 3.2 Endpoint de recommandation
```python
# main.py
@app.post("/recommend")
async def get_recommendations(request: RecommendationRequest):
    """
    Retourne les prestataires triés par score de pertinence.
    """
    scored = []
    for provider in request.providers:
        score = recommender.score_provider(
            provider=provider,
            client_request=request.client_context,
            distance_km=provider['distance_km']
        )
        scored.append({ **provider, 'ai_score': score })

    # Trier par score décroissant
    scored.sort(key=lambda x: x['ai_score'], reverse=True)

    return { 'providers': scored[:20] }
```

---

## 4. Détection de faux avis

```python
# models/review_scorer.py
import re
from datetime import datetime

class ReviewFraudDetector:

    SUSPICIOUS_PATTERNS = [
        r'arnaque|escroc|voleur',                    # accusations graves
        r'https?://\S+',                              # URLs
        r'(\w)\1{4,}',                               # répétitions (aaaa, !!!!)
        r'[A-Z]{5,}',                                 # MAJUSCULES EN CONTINU
    ]

    def score_review(self, review: dict, booking: dict) -> dict:
        """
        Retourne un score de confiance et les raisons de suspicion.
        """
        flags = []
        score = 1.0  # score de confiance (1 = fiable, 0 = suspect)

        # 1. Délai entre fin de mission et avis
        if booking.get('completed_at'):
            delta = (
                datetime.fromisoformat(review['created_at']) -
                datetime.fromisoformat(booking['completed_at'])
            ).total_seconds()
            if delta < 120:  # moins de 2 minutes
                flags.append('review_too_fast')
                score -= 0.3

        # 2. Contenu suspect
        for pattern in self.SUSPICIOUS_PATTERNS:
            if re.search(pattern, review['comment'] or '', re.I):
                flags.append(f'suspicious_content: {pattern}')
                score -= 0.2

        # 3. Utilisateur avec peu d'historique
        if review.get('reviewer_jobs_count', 0) < 2:
            flags.append('new_account')
            score -= 0.1

        # 4. Note extrême sans commentaire
        if review['rating'] in [1, 5] and not review.get('comment'):
            flags.append('extreme_rating_no_comment')
            score -= 0.2

        return {
            'confidence_score': max(0.0, round(score, 2)),
            'flags': flags,
            'auto_approve': score >= 0.7,
            'requires_moderation': score < 0.7
        }
```

---

## 5. Chatbot d'assistance (Claude API)

```typescript
// src/modules/chat/chatbot.service.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Tu es l'assistant BLA, une application de mise en relation
entre clients et prestataires de services en Afrique.
Tu réponds en français ou en wolof selon la langue de l'utilisateur.
Tu es utile, concis et bienveillant.
Tu ne partages jamais d'informations personnelles sur d'autres utilisateurs.
Tu orientes les problèmes complexes vers l'équipe de support humain.

Sujets que tu peux traiter :
- Aide à la recherche de prestataires
- Explication du processus de réservation
- Questions sur les paiements (Mobile Money, Wave, Orange Money)
- Procédures de signalement et litiges
- Questions générales sur la plateforme`;

export async function getChatbotResponse(
  userMessage: string,
  conversationHistory: Array<{role: 'user'|'assistant'; content: string}>
): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',  // Haiku pour la rapidité et le coût
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ]
  });

  return response.content[0].type === 'text'
    ? response.content[0].text
    : 'Je ne peux pas répondre pour le moment.';
}
```

---

## 6. Estimation de prix

```python
# models/price_estimator.py
# Basé sur : catégorie, ville, heure, distance, historique des prix

def estimate_price(category_slug: str, city: str, hour: int) -> dict:
    """
    Retourne une fourchette de prix estimée basée sur les données historiques.
    """
    # Prix médians par catégorie et ville (mis à jour hebdomadairement)
    BASE_PRICES = {
        'plomberie': {'dakar': 8000, 'abidjan': 7000},
        'electricite': {'dakar': 6000, 'abidjan': 5500},
        # ...
    }

    base = BASE_PRICES.get(category_slug, {}).get(city, 5000)

    # Majoration heures creuses/pleines
    if 7 <= hour <= 17:
        multiplier = 1.0
    elif 17 <= hour <= 20:
        multiplier = 1.2   # +20% heure de pointe
    else:
        multiplier = 1.5   # +50% nuit/urgence

    estimated = base * multiplier

    return {
        'min': int(estimated * 0.8),
        'max': int(estimated * 1.3),
        'median': int(estimated),
        'currency': 'XOF'
    }
```
