# Contrat — ingestion des données de santé

## Endpoint

```http
POST {BACKEND_URL}/api/health/records
Content-Type: application/json
Authorization: Bearer <jeton optionnel>
Idempotency-Key: google-health-connect:<from>:<to>:<generatedAt>
```

`BACKEND_URL` doit être une **origine** (`https://hôte[:port]`), sans chemin, query ni fragment.
L'application refuse les identifiants intégrés à l'URL, les IDN et le HTTP clair hors développement local.

Réponse attendue :

```json
{ "ok": true, "received": 4 }
```

Une erreur doit être renvoyée avec un statut 4xx/5xx et un champ `message` lisible. Le client
réessaie **une seule fois sur `429` et `5xx** uniquement (en honorant `Retry-After`, borné à 5 s).
Il ne réessaie **jamais** sur une erreur réseau ou un timeout, pour éviter les doublons ; le backend
doit utiliser `Idempotency-Key` pour dédupliquer les tentatives légitimes. Un `200` avec
`"ok": false` ou un `received` inférieur au nombre d'enregistrements envoyés est traité comme un
échec.

## Schéma `health.records/v1`

```json
{
  "schemaVersion": 1,
  "source": "google-health-connect",
  "platform": "android",
  "generatedAt": "2026-11-21T12:00:01.000Z",
  "window": {
    "from": "2026-11-20T12:00:00.000Z",
    "to": "2026-11-21T12:00:00.000Z"
  },
  "grantedPermissions": [
    { "accessType": "read", "recordType": "HeartRate" },
    { "accessType": "read", "recordType": "Steps" }
  ],
  "limits": {
    "maxRecordsPerType": 1000,
    "truncatedTypes": []
  },
  "readCounts": {
    "HeartRate": 1,
    "Steps": 3
  },
  "counts": {
    "HeartRate": 1,
    "Steps": 3
  },
  "readErrors": [],
  "records": [
    {
      "type": "Steps",
      "startTime": "2026-11-21T09:00:00.000Z",
      "endTime": "2026-11-21T09:10:00.000Z",
      "count": 900,
      "source": "com.example.watch"
    },
    {
      "type": "HeartRate",
      "startTime": "2026-11-21T09:00:00.000Z",
      "endTime": "2026-11-21T09:10:00.000Z",
      "samples": [
        { "time": "2026-11-21T09:01:00.000Z", "beatsPerMinute": 72 }
      ]
    },
    {
      "type": "SleepSession",
      "startTime": "2026-11-20T22:00:00.000Z",
      "endTime": "2026-11-21T06:30:00.000Z",
      "stages": [
        {
          "startTime": "2026-11-20T22:00:00.000Z",
          "endTime": "2026-11-20T23:00:00.000Z",
          "stage": 5
        }
      ]
    },
    {
      "type": "Weight",
      "time": "2026-11-21T08:00:00.000Z",
      "weightKg": 68.2
    },
    {
      "type": "RestingHeartRate",
      "time": "2026-11-21T08:01:00.000Z",
      "beatsPerMinute": 61
    },
    {
      "type": "ActiveCaloriesBurned",
      "startTime": "2026-11-21T09:00:00.000Z",
      "endTime": "2026-11-21T09:10:00.000Z",
      "energyKcal": 42.5
    }
  ]
}
```

## Types de champs

| Champ | Type | Notes |
| --- | --- | --- |
| `Idempotency-Key` | header | Clé stable dérivée de la fenêtre et de `generatedAt` ; déduplication côté backend. |
| `schemaVersion` | `1` | Version du contrat. |
| `source` | `"google-health-connect"` | Provenance réelle, jamais simulée. |
| `generatedAt` | ISO 8601 | Date de construction du payload. |
| `window` | `{from,to}` | Fenêtre de lecture (24 h glissantes). |
| `grantedPermissions` | tableau | Permissions de lecture effectivement accordées. |
| `limits.maxRecordsPerType` | entier | Plafond par type (1000 par défaut). |
| `limits.truncatedTypes` | tableau de chaînes | Types ayant dépassé le plafond ; donnée partielle. |
| `readCounts` | objet | Comptes **avant** troncature = ce qui a réellement été lu. |
| `counts` | objet | Comptes **après** troncature = ce qui est réellement envoyé. |
| `readErrors` | tableau de chaînes | Codes d'erreur stables par type (ex. `HeartRate : lecture impossible (SecurityException)`). Une liste non vide signifie une fenêtre partielle. |
| `records[].type` | chaîne | `Steps`, `HeartRate`, `RestingHeartRate`, `SleepSession`, `Weight`, `ActiveCaloriesBurned`. |
| `records[].source` | chaîne optionnelle | `dataOrigin` fourni par Health Connect, absent si inconnu. |

Les unités sont normalisées : `weightKg` en kilogrammes, `energyKcal` en kilocalories,
`beatsPerMinute` en bpm. Les identifiants de stade de sommeil sont ceux de Health Connect
(`SleepStageType` : 1 = éveillé, 2 = endormi, 4 = léger, 5 = profond, 6 = paradoxal).

## Garanties et responsabilités

- Le client n'envoie que des données lues et affichées, après consentement explicite.
- Le client n'ajoute aucune valeur de démonstration et ne modifie pas les mesures.
- `grantedPermissions` permet au backend de vérifier que le champ lu était autorisé.
- Le backend doit appliquer ses propres contrôles : **authentification fortement recommandée**,
  validation du schéma, limitation de taille, déduplication par `Idempotency-Key`, chiffrement au
  repos et politique de rétention.
- En cas de `limits.truncatedTypes` ou `readErrors` non vides, le backend doit considérer la fenêtre
  comme partielle.
- La lecture est plafonnée à 1000 enregistrements par type. Un dépassement **côté lecture** est
  signalé dans `readErrors` (« lecture partielle ») ; `limits.truncatedTypes` couvre le cas où plus
  de 1000 enregistrements parviennent au constructeur de payload. Les deux champs doivent être
  traités comme une fenêtre partielle.
