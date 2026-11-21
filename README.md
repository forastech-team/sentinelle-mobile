# Sentinelle Santé — application mobile React Native

Dépôt : [forastech-team/sentinelle-mobile](https://github.com/forastech-team/sentinelle-mobile)

Application **React Native / Expo (SDK 58)** autonome qui lit les données de santé de l'utilisateur
depuis **Health Connect** (API santé de Google sur Android) et les envoie au backend Sentinelle.

> ⚠️ Ce dépôt est **séparé** de `smartcity-sentinelle`. Il ne modifie pas le backend.
> Le backend doit exposer `POST {BACKEND_URL}/api/health/records` (contrat dans
> [`docs/contracts/health.md`](docs/contracts/health.md)).

## Ce que fait l'application

1. Vérifie la disponibilité de Health Connect et initialise le SDK.
2. Demande des permissions **de lecture seule** : pas, fréquence cardiaque, FC au repos, sommeil,
   poids, calories actives.
3. Lit les **24 dernières heures** de données **réelles** (1000 enregistrements max par type).
4. Affiche un aperçu local avant tout envoi et permet de l'effacer.
5. Envoie le payload JSON au backend **uniquement sur action explicite** de l'utilisateur.

Aucune donnée n'est simulée, générée ou envoyée en arrière-plan. Aucun secret n'est journalisé.

## Limites importantes

- **Android uniquement** : Health Connect est la plateforme santé de Google sur Android.
  Google Fit étant déprécié pour les nouvelles intégrations, il n'est pas utilisé.
- **iOS / Apple Health n'est pas pris en charge** dans cette version.
- `minSdkVersion = 26` (Android 8.0). Health Connect est requis sur **Android 9+** et intégré au
  système dès Android 14 ; un verrouillage d'écran est nécessaire.
- **Expo Go ne peut pas exécuter cette application** : elle contient un module natif. Il faut un
  development build (EAS) ou `expo run:android`. `expo-dev-client` est installé et `eas.json` définit
  les profils `development` et `production`.
- Pour une publication Play Store, Google exige une déclaration d'accès aux données Health Connect
  dans la Play Console, ainsi qu'une politique de confidentialité. Prévoir le délai de validation
  et de propagation de l'autorisation côté Google. Utilisez un keystore de production via EAS : ne
  publiez jamais un APK release signé avec la clé de debug générée par un build local.

## Installation

```bash
npm install
cp .env.example .env          # facultatif : renseigner EXPO_PUBLIC_BACKEND_URL
npm run typecheck
npm test
```

`babel-preset-expo` est déclaré explicitement en devDependency : Expo l'installe en interne mais
Metro ne peut pas le résoudre depuis la config Babel racine sans cette déclaration.

## Lancer sur Android

```bash
# 1) Générer les fichiers natifs (une fois, ou après changement de app.json)
npm run prebuild

# 2a) Build local avec le SDK Android 37 et JDK 17 installés
npm run android

# 2b) OU development build EAS (recommandé pour tester sur appareil physique)
npx eas-cli login
npm run eas:build:dev
```

Démarrer le serveur Metro avec `npm start` (mode `--dev-client`).
Le build EAS `production` utilise `app-bundle` ; la signature release doit être configurée dans EAS.

## Configuration du backend

Deux options :

- variable `EXPO_PUBLIC_BACKEND_URL` dans `.env` (valeur par défaut), ou
- saisie directe dans l'application, stockée dans `expo-secure-store`.

Contraintes sur l'URL de base :

- origine uniquement (`https://hôte[:port]`), **sans chemin, query ni fragment** ;
- **HTTPS obligatoire** en production (HTTP uniquement pour `localhost`, `127.0.0.1`, `10.0.2.2` et
  `[::1]` en développement) ;
- identifiants intégrés à l'URL (`https://user:pass@hôte`) et noms de domaine internationalisés
  refusés ; l'hôte résolu est affiché dans l'application avant l'envoi.

Le jeton d'envoi est optionnel, stocké dans le trousseau sécurisé **et lié à l'hôte** : changer
d'hôte le rend inutilisable. **Ne jamais committer de jeton** ni de `.env` : `.gitignore` les exclut
et `.env.example` reste vide. L'endpoint envoyé est `{BACKEND_URL}/api/health/records`.

## Confidentialité

- Permissions de lecture uniquement, révocables depuis les réglages Health Connect.
- Aucune télémétrie, aucun analytics, aucune synchronisation automatique.
- Les données affichées sont exactement celles envoyées ; les erreurs et troncatures sont déclarées
  dans le payload (`readErrors`, `limits.truncatedTypes`).
- Chaque enregistrement conserve son `source` (`dataOrigin`) lorsque Health Connect le fournit.
- Aucune donnée de santé n'est journalisée ni envoyée dans les messages d'erreur. Le jeton reste
  en mémoire pendant la session (champ masqué) mais n'est jamais affiché en clair.
- L'aperçu brut est effacé après un envoi réussi, et un bouton permet de le supprimer à tout moment.
- Le plugin Android `plugins/withSecureAndroid.js` retire `SYSTEM_ALERT_WINDOW`, désactive
  `allowBackup`, ignore les touches superposées et pose `FLAG_SECURE` (captures et vignette
  multitâche interdites).

## Validation

```bash
npm run typecheck            # TypeScript strict
npm test                     # payload, validation d'URL, client HTTP (fetch mocké)
npx expo export --platform android --output-dir /tmp/opencode/sentinelle-mobile-export
npm run prebuild             # vérifie plugins et manifeste généré
```

## Arborescence

```text
src/App.tsx                    interface, consentement et effacement local
src/backend/client.ts          POST JSON, timeout 8s, retry 429/5xx, Idempotency-Key
src/backend/config.ts          URL/jeton dans expo-secure-store, jeton lié à l'hôte
src/backend/url.ts             validation HTTPS + origine + endpoint
src/backend/*.test.ts          tests URL et client
src/health/healthConnect.ts    lectures natives et normalisation
src/health/model.ts            types des données et permissions
src/health/payload.ts          construction pure du schéma health.records/v1
src/health/payload.test.ts     tests du schéma
plugins/withSecureAndroid.js   durcissement du manifeste et de MainActivity
eas.json                       profils de build EAS
docs/contracts/health.md       contrat backend
```
