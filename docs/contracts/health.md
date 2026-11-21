# Contrat — ingestion des données de santé

## Endpoint

```http
POST {BACKEND_URL}/api/health/records
Content-Type: application/json
Authorization: Bearer <jeton optionnel>
```

Réponse attendue :

```json
{ "ok": true, "received": 4 }
```

Une erreur doit être renvoyée avec un statut 4xx/5xx et un champ `message` lisible. Le client
réessaie une seule fois sur `429` et `5xx`, puis affiche le message sans journaliser les données.

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
  "counts": {
    "HeartRate": 1,
    "Steps": 3
  },
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
| `schemaVersion` | `1` | Version du contrat. |
| `source` | `"google-health-connect"` | Provenance réelle, jamais simulée. |
| `generatedAt` | ISO 8601 | Date de construction du payload. |
| `window` | `{from,to}` | Fenêtre de lecture (24 h glissantes). |
| `grantedPermissions` | tableau | Permissions de lecture effectivement accordées. |
| `limits.maxRecordsPerType` | entier | Plafond par type (1000 par défaut). |
| `limits.truncatedTypes` | tableau de chaînes | Types ayant dépassé le plafond ; donnée partielle. |
| `counts` | objet | Comptes **après** troncature = ce qui est réellement envoyé. |
| `records[].type` | chaîne | `Steps`, `HeartRate`, `RestingHeartRate`, `SleepSession`, `Weight`, `ActiveCaloriesBurned`. |
| `records[].source` | chaîne optionnelle | `dataOrigin` fourni par Health Connect, absent si inconnu. |

Les unités sont normalisées : `weightKg` en kilogrammes, `energyKcal` en kilocalories,
`beatsPerMinute` en bpm. Les identifiants de stade de sommeil sont ceux de Health Connect
(`SleepStageType` : 1 = éveillé, 2 = endormi, 4 = léger, 5 = profond, 6 = paradoxal).

## Garanties et responsabilités

- Le client n'envoie que des données lues et affichées, après consentement explicite.
- Le client n'ajoute aucune valeur de démonstration et ne modifie pas les mesures.
- `grantedPermissions` permet au backend de vérifier que le champ lu était autorisé.
- Le backend doit appliquer ses propres contrôles : authentification, validation du schéma,
  limitation de taille, chiffrement au repos et politique de rétention.
- En cas de `limits.truncatedTypes` non vide, le backend doit considérer la fenêtre comme partielle.
