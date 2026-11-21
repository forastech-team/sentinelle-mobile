# Sentinelle Santé — application mobile React Native

Application **React Native / Expo (SDK 58)** autonome qui lit les données de santé de l'utilisateur
depuis **Health Connect** (API santé de Google sur Android) et les envoie au backend Sentinelle.

> ⚠️ Ce dépôt est **séparé** de `smartcity-sentinelle`. Il ne modifie pas le backend.
> Le backend doit exposer `POST {BACKEND_URL}/api/health/records` (contrat dans
> [`docs/contracts/health.md`](docs/contracts/health.md)).

## Ce que fait l'application

1. Vérifie la disponibilité de Health Connect et initialise le SDK.
2. Demande des permissions **de lecture seule** : pas, fréquence cardiaque, fréquence cardiaque au
   repos, sommeil, poids, calories actives.
3. Lit les **24 dernières heures** de données **réelles** (pagination plafonnée à 5 pages de 1000).
4. Affiche un aperçu local avant tout envoi.
5. Envoie le payload JSON au backend **uniquement sur action explicite** de l'utilisateur.

Aucune donnée n'est simulée, générée ou envoyée en arrière-plan. Aucun secret n'est journalisé.

## Limites importantes

- **Android uniquement** : Health Connect est la plateforme santé de Google sur Android.
  Google Fit étant déprécié pour les nouvelles intégrations, il n'est pas utilisé.
- **iOS / Apple Health n'est pas pris en charge** dans cette version.
- Nécessite Android 9+ (minSdk 26) et l'application Health Connect installée (intégrée au système
  dès Android 14), avec un verrouillage d'écran actif.
- **Expo Go ne peut pas exécuter cette application** : elle contient un module natif. Il faut un
  development build (EAS) ou `expo run:android`.
- Pour une publication Play Store, Google exige une déclaration d'accès aux données Health Connect
  dans la Play Console, ainsi qu'une politique de confidentialité. Prévoir le délai de validation
  et de propagation de l'autorisation côté Google.

## Installation

```bash
npm install
cp .env.example .env          # facultatif : renseigner EXPO_PUBLIC_BACKEND_URL
npm run typecheck
npm test
```

## Lancer sur Android

```bash
# 1) Générer les fichiers natifs (une fois, ou après changement de app.json)
npm run prebuild

# 2a) Build local avec le SDK Android installé
npm run android

# 2b) OU development build EAS (recommandé pour tester sur appareil physique)
npx eas-cli login
npx eas-cli build --profile development --platform android
```

Démarrer le serveur Metro avec `npm start` (mode `--dev-client`).

## Configuration du backend

Deux options :

- variable `EXPO_PUBLIC_BACKEND_URL` dans `.env` (valeur par défaut), ou
- saisie directe dans l'application, stockée dans `expo-secure-store`.

Le jeton d'envoi est optionnel et stocké dans le trousseau sécurisé. **Ne jamais committer de jeton**
ni de `.env` : `.gitignore` les exclut, et `.env.example` reste vide.

L'URL doit être en **HTTPS**, sauf `localhost`, `127.0.0.1` et `10.0.2.2` pour le développement.
L'endpoint envoyé est `{BACKEND_URL}/api/health/records`.

## Confidentialité

- Permissions de lecture uniquement, révocables depuis les réglages Health Connect.
- Aucune télémétrie, aucun analytics, aucune synchronisation automatique.
- Les données affichées sont exactement celles envoyées (voir le schéma `health.records/v1`).
- Chaque enregistrement conserve son `source` (`dataOrigin`) lorsque Health Connect le fournit,
  pour que le backend puisse tracer l'origine réelle sans inventer de provenance.
- Les troncatures éventuelles sont déclarées dans `limits.truncatedTypes`.

## Validation

```bash
npm run typecheck   # TypeScript strict
npm test            # tests unitaires du payload et de la validation d'URL
npm run prebuild    # vérifie aussi la configuration des plugins natifs
```

## Arborescence

```text
src/App.tsx                  interface et consentement explicite
src/backend/client.ts        POST JSON, timeout, retry unique sur 429/5xx
src/backend/config.ts        URL/jeton dans expo-secure-store
src/backend/url.ts           validation HTTPS + endpoint
src/health/healthConnect.ts  lectures natives et normalisation
src/health/model.ts          types des données et permissions
src/health/payload.ts        construction pure du schéma health.records/v1
docs/contracts/health.md     contrat backend
```
