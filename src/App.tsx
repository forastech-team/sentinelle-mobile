import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { sendHealthPayload, type SendResult } from './backend/client';
import { loadBackendConfig, saveBackendToken, saveBackendUrl } from './backend/config';
import {
  BackendConfigurationError,
  backendHost,
  checkSendTarget,
  isTokenRebind,
  validateBackendUrl,
} from './backend/url';
import {
  checkHealthConnect,
  currentHealthPermissions,
  openHealthConnectSettingsScreen,
  readHealthSnapshot,
  requestHealthPermissions,
  type HealthSnapshot,
  type SdkState,
} from './health/healthConnect';
import { makeTimeWindow, type HealthPermission } from './health/model';
import { buildPayload, type HealthPayload } from './health/payload';

type Busy = 'permissions' | 'read' | 'save' | 'send' | 'clear' | null;

const LAST_SYNC_KEY = 'sentinelle.lastSyncAt';

function permissionsLabel(permissions: readonly HealthPermission[]): string {
  if (permissions.length === 0) {
    return 'Aucune permission accordée pour le moment.';
  }
  return permissions.map((permission) => permission.recordType).join(' · ');
}

function samePermissions(
  left: readonly HealthPermission[],
  right: readonly HealthPermission[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const leftTypes = left.map((permission) => permission.recordType).sort();
  const rightTypes = right.map((permission) => permission.recordType).sort();
  return leftTypes.every((type, index) => type === rightTypes[index]);
}

/** Les messages techniques natifs ne sont jamais affichés tels quels. */
function safeMessage(error: unknown, fallback: string): string {
  if (error instanceof BackendConfigurationError) {
    return error.message;
  }
  return fallback;
}

function sdkMessage(state: SdkState): string {
  switch (state) {
    case 'available':
      return 'Health Connect est disponible. Vous contrôlez chaque lecture et chaque envoi.';
    case 'update-required':
      return 'Health Connect est installé mais trop ancien : mettez-le à jour depuis le Play Store.';
    case 'unavailable':
      return 'Health Connect est indisponible : Android 9+ ou application Health Connect requise.';
  }
}

export default function App() {
  const [sdkState, setSdkState] = useState<SdkState | 'unknown'>('unknown');
  const [initialized, setInitialized] = useState(false);
  const [permissions, setPermissions] = useState<HealthPermission[]>([]);
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [savedHost, setSavedHost] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [tokenHost, setTokenHost] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState('Chargement…');
  const [sendResult, setSendResult] = useState<SendResult | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [health, config, storedSync] = await Promise.all([
          checkHealthConnect(),
          loadBackendConfig(),
          AsyncStorage.getItem(LAST_SYNC_KEY),
        ]);
        if (!mounted) return;

        setSdkState(health.state);
        setInitialized(health.initialized);
        setBaseUrl(config.baseUrl);
        setSavedHost(backendHost(config.baseUrl));
        setToken(config.token ?? '');
        setTokenHost(config.tokenHost ?? null);
        setLastSync(storedSync);

        if (health.state === 'available' && health.initialized) {
          try {
            const granted = await currentHealthPermissions();
            if (mounted) setPermissions(granted);
          } catch {
            if (mounted) setPermissions([]);
          }
        }
        if (mounted) setMessage(sdkMessage(health.state));
      } catch (error) {
        if (mounted) setMessage(safeMessage(error, 'Initialisation impossible.'));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onRequestPermissions = useCallback(async () => {
    setBusy('permissions');
    setMessage('');
    try {
      const granted = await requestHealthPermissions();
      setPermissions(granted);
      setMessage(
        granted.length > 0
          ? `${granted.length} permission(s) de lecture accordée(s).`
          : 'Aucune permission accordée.',
      );
    } catch {
      setMessage('Demande de permission impossible.');
    } finally {
      setBusy(null);
    }
  }, []);

  const onRead = useCallback(async () => {
    setBusy('read');
    setMessage('');
    setSendResult(null);
    try {
      const granted = await currentHealthPermissions().catch(() => permissions);
      const nextSnapshot = await readHealthSnapshot(makeTimeWindow());
      const nextPayload = buildPayload({
        window: nextSnapshot.window,
        records: nextSnapshot.records,
        grantedPermissions: granted,
        readErrors: nextSnapshot.errors,
      });
      setPermissions(granted);
      setSnapshot(nextSnapshot);
      setPayload(nextPayload);
      const total = Object.values(nextPayload.counts).reduce((sum, count) => sum + count, 0);
      const partial =
        nextSnapshot.errors.length > 0
          ? ` Lecture partielle (${nextSnapshot.errors.length} type(s)).`
          : '';
      setMessage(`${total} enregistrement(s) réel(s) lu(s).${partial}`);
    } catch {
      setMessage('Lecture Health Connect impossible.');
    } finally {
      setBusy(null);
    }
  }, [permissions]);

  const onSaveConfig = useCallback(async () => {
    setBusy('save');
    setMessage('');
    try {
      const validated = validateBackendUrl(baseUrl);
      const newHost = backendHost(validated);
      if (!newHost) {
        setMessage("L'URL du backend est invalide.");
        return;
      }
      const existing = await loadBackendConfig();
      const trimmedToken = token.trim();

      // Un jeton chargé depuis le trousseau ne doit jamais être réassigné à un autre hôte.
      if (isTokenRebind(existing, trimmedToken, newHost)) {
        setToken('');
        setMessage('Ce jeton est lié à un autre hôte. Saisissez un jeton pour ce nouvel hôte.');
        return;
      }

      setBaseUrl(validated);
      setSavedHost(newHost);
      setToken(trimmedToken);
      setTokenHost(trimmedToken ? newHost : null);
      await Promise.all([
        saveBackendUrl(validated),
        saveBackendToken(trimmedToken, validated),
      ]);
      setMessage('Configuration enregistrée dans le stockage sécurisé.');
    } catch (error) {
      setMessage(safeMessage(error, 'Enregistrement de la configuration impossible.'));
    } finally {
      setBusy(null);
    }
  }, [baseUrl, token]);

  const onSend = useCallback(async () => {
    if (!snapshot || !payload) {
      setMessage('Lisez d’abord vos données avant de les envoyer.');
      return;
    }
    setBusy('send');
    setMessage('');
    setSendResult(null);
    try {
      const freshPermissions = await currentHealthPermissions().catch(() => permissions);
      let toSend = payload;
      if (!samePermissions(freshPermissions, payload.grantedPermissions)) {
        toSend = buildPayload({
          window: payload.window,
          records: snapshot.records,
          grantedPermissions: freshPermissions,
          readErrors: snapshot.errors,
          generatedAt: payload.generatedAt,
          maxRecordsPerType: payload.limits.maxRecordsPerType,
        });
        setPayload(toSend);
        setPermissions(freshPermissions);
        setMessage('Permissions rafraîchies avant l’envoi.');
      }

      // Le jeton utilisé est relu depuis le trousseau : jamais depuis le champ modifiable.
      const checked = checkSendTarget(baseUrl, await loadBackendConfig());
      if (!checked.ok) {
        setMessage(checked.message);
        return;
      }

      const result = await sendHealthPayload(checked.target, toSend);
      setSendResult(result);
      if (result.ok) {
        const now = new Date().toISOString();
        await AsyncStorage.setItem(LAST_SYNC_KEY, now);
        setLastSync(now);
        setSnapshot(null);
        setPayload(null);
        setMessage(`${result.message} Aperçu local effacé après envoi.`);
      } else {
        setMessage(result.message);
      }
    } catch (error) {
      setMessage(safeMessage(error, 'Envoi impossible.'));
    } finally {
      setBusy(null);
    }
  }, [baseUrl, payload, permissions, snapshot]);

  const onClear = useCallback(() => {
    setBusy('clear');
    setSnapshot(null);
    setPayload(null);
    setSendResult(null);
    setMessage('Données de santé locales effacées.');
    setBusy(null);
  }, []);

  const isBusy = busy !== null;
  const sentCount = payload ? Object.values(payload.counts).reduce((sum, count) => sum + count, 0) : 0;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sentinelle Santé</Text>
        <Text style={styles.subtitle}>
          Données réelles lues depuis Health Connect (Google Health, Android). Aucune donnée simulée.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Plateforme</Text>
          <Text style={styles.text}>Statut Health Connect : {sdkState}</Text>
          <Text style={styles.text}>Initialisé : {initialized ? 'oui' : 'non'}</Text>
          <Text style={styles.note}>
            Health Connect est requis sur Android 9+ (minSdk 26 = Android 8.0) et intégré au système
            dès Android 14. Un verrouillage d’écran est nécessaire. iOS / Apple Health n’est pas pris
            en charge dans cette version.
          </Text>
          <TouchableOpacity style={styles.buttonSecondary} onPress={openHealthConnectSettingsScreen}>
            <Text style={styles.buttonText}>Ouvrir les réglages Health Connect</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>1 · Autorisation</Text>
          <Text style={styles.text}>{permissionsLabel(permissions)}</Text>
          <Text style={styles.note}>
            Permissions demandées : pas, fréquence cardiaque, fréquence au repos, sommeil, poids,
            calories actives. Lecture seule.
          </Text>
          <TouchableOpacity
            style={styles.button}
            disabled={isBusy || sdkState !== 'available'}
            onPress={onRequestPermissions}
          >
            {busy === 'permissions' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Autoriser la lecture</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>2 · Lecture des 24 dernières heures</Text>
          <Text style={styles.text}>
            {payload
              ? Object.entries(payload.counts)
                  .map(([type, count]) => `${type} : ${count}`)
                  .join(' · ') || 'Aucune donnée réelle trouvée sur cette fenêtre.'
              : 'Aucune lecture effectuée.'}
          </Text>
          {payload && payload.readErrors.length > 0 ? (
            <Text style={styles.note}>Lecture partielle : {payload.readErrors.join(' ; ')}</Text>
          ) : null}
          {payload && payload.records.length > 0 ? (
            <Text style={styles.mono}>{JSON.stringify(payload.records.slice(0, 3), null, 2)}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.button}
            disabled={isBusy || !initialized}
            onPress={onRead}
          >
            {busy === 'read' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Lire mes données de santé</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>3 · Backend</Text>
          <Text style={styles.note}>
            URL de base (origine uniquement, sans chemin ni paramètres). Le jeton, si votre backend
            en exige un, est stocké dans le trousseau sécurisé et lié à cet hôte. Il n’est jamais
            journalisé, mais reste en mémoire pendant que l’application est ouverte.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="https://backend.exemple.com"
            placeholderTextColor="#8a94a6"
            value={baseUrl}
            onChangeText={setBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            placeholder="Jeton d’envoi (optionnel)"
            placeholderTextColor="#8a94a6"
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.buttonSecondary} disabled={isBusy} onPress={onSaveConfig}>
            {busy === 'save' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Enregistrer la configuration</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.text}>Hôte destination : {backendHost(baseUrl) ?? '—'}</Text>
          <Text style={styles.text}>Hôte enregistré : {savedHost ?? '—'}</Text>
          <Text style={styles.text}>Hôte du jeton : {tokenHost ?? 'aucun'}</Text>
          <Text style={styles.text}>Endpoint : {baseUrl || '—'}/api/health/records</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>4 · Envoi</Text>
          <Text style={styles.note}>
            Aucun envoi automatique : {sentCount} enregistrement(s) prêt(s). L’aperçu JSON ci-dessus
            est partiel (3 premiers) ; l’intégralité comptée sera envoyée. L’aperçu est effacé après
            un envoi réussi.
          </Text>
          <TouchableOpacity
            style={styles.button}
            disabled={isBusy || !payload || payload.records.length === 0 || !baseUrl}
            onPress={onSend}
          >
            {busy === 'send' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Envoyer au backend</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.buttonSecondary}
            disabled={isBusy || (!payload && !snapshot)}
            onPress={onClear}
          >
            <Text style={styles.buttonText}>Supprimer les données locales</Text>
          </TouchableOpacity>
          {sendResult ? (
            <Text style={sendResult.ok ? styles.success : styles.error}>
              {sendResult.ok ? '✓' : '✕'} {sendResult.message}
            </Text>
          ) : null}
          <Text style={styles.text}>Dernier envoi réussi : {lastSync ?? 'jamais'}</Text>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Text style={styles.footer}>
          Schéma : health.records/v1 · source : google-health-connect · aucune donnée de démonstration.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1420',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: '#9fb0c8',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  card: {
    backgroundColor: '#162234',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  text: {
    color: '#dbe4f0',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 6,
  },
  note: {
    color: '#9fb0c8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  mono: {
    color: '#a8e6cf',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },
  message: {
    color: '#ffd479',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 12,
  },
  success: {
    color: '#7ee2a8',
    fontSize: 13,
    marginTop: 10,
  },
  error: {
    color: '#ff9a9a',
    fontSize: 13,
    marginTop: 10,
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonSecondary: {
    backgroundColor: '#243550',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0f1a2a',
    color: '#ffffff',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#2c3e58',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  footer: {
    color: '#6f7f96',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
