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
import { validateBackendUrl } from './backend/url';
import {
  checkHealthConnect,
  currentHealthPermissions,
  openHealthConnectSettingsScreen,
  readHealthSnapshot,
  requestHealthPermissions,
  type HealthSnapshot,
  type SdkState,
} from './health/healthConnect';
import { countByType, makeTimeWindow, type HealthPermission } from './health/model';
import { buildPayload, type HealthPayload } from './health/payload';

type Busy = 'permissions' | 'read' | 'save' | 'send' | null;

const LAST_SYNC_KEY = 'sentinelle.lastSyncAt';

function permissionsLabel(permissions: readonly HealthPermission[]): string {
  if (permissions.length === 0) {
    return 'Aucune permission accordée pour le moment.';
  }
  return permissions.map((permission) => permission.recordType).join(' · ');
}

function snapshotLabel(snapshot: HealthSnapshot | null): string {
  if (!snapshot) {
    return 'Aucune lecture effectuée.';
  }
  const counts = countByType(snapshot.records);
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return 'Aucune donnée réelle trouvée sur cette fenêtre de 24 h.';
  }
  return entries.map(([type, count]) => `${type} : ${count}`).join(' · ');
}

export default function App() {
  const [sdkState, setSdkState] = useState<SdkState | 'unknown'>('unknown');
  const [initialized, setInitialized] = useState(false);
  const [permissions, setPermissions] = useState<HealthPermission[]>([]);
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [payloadPreview, setPayloadPreview] = useState<HealthPayload | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
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
        setPermissions(await currentHealthPermissions());
        setBaseUrl(config.baseUrl);
        setToken(config.token ?? '');
        setLastSync(storedSync);
        setMessage(
          health.state === 'available'
            ? 'Health Connect est disponible. Vous contrôlez chaque lecture et chaque envoi.'
            : 'Health Connect est indisponible sur cet appareil (Android 9+ ou application Health Connect requise).',
        );
      } catch (error) {
        if (mounted) {
          setMessage(error instanceof Error ? error.message : 'Initialisation impossible.');
        }
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Demande de permission impossible.');
    } finally {
      setBusy(null);
    }
  }, []);

  const onRead = useCallback(async () => {
    setBusy('read');
    setMessage('');
    setSendResult(null);
    try {
      const nextSnapshot = await readHealthSnapshot(makeTimeWindow());
      setSnapshot(nextSnapshot);
      const counts = countByType(nextSnapshot.records);
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const errors =
        nextSnapshot.errors.length > 0
          ? ` Lecture partielle : ${nextSnapshot.errors.join(' ; ')}`
          : '';
      setMessage(`${total} enregistrement(s) réel(s) lu(s).${errors}`);
      setPayloadPreview(
        buildPayload({
          window: nextSnapshot.window,
          records: nextSnapshot.records,
          grantedPermissions: permissions,
        }),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Lecture Health Connect impossible.');
    } finally {
      setBusy(null);
    }
  }, [permissions]);

  const onSaveConfig = useCallback(async () => {
    setBusy('save');
    setMessage('');
    try {
      const validated = validateBackendUrl(baseUrl);
      setBaseUrl(validated);
      await Promise.all([saveBackendUrl(validated), saveBackendToken(token.trim())]);
      setMessage('Configuration enregistrée dans le stockage sécurisé.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setBusy(null);
    }
  }, [baseUrl, token]);

  const onSend = useCallback(async () => {
    if (!snapshot) {
      setMessage('Lisez d’abord vos données avant de les envoyer.');
      return;
    }
    setBusy('send');
    setMessage('');
    setSendResult(null);
    try {
      const payload = buildPayload({
        window: snapshot.window,
        records: snapshot.records,
        grantedPermissions: permissions,
      });
      const result = await sendHealthPayload({ baseUrl, ...(token ? { token } : {}) }, payload);
      setSendResult(result);
      if (result.ok) {
        const now = new Date().toISOString();
        await AsyncStorage.setItem(LAST_SYNC_KEY, now);
        setLastSync(now);
      }
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Envoi impossible.');
    } finally {
      setBusy(null);
    }
  }, [baseUrl, permissions, snapshot, token]);

  const isBusy = busy !== null;

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
            Android uniquement. Health Connect doit être installé (intégré à Android 14+) et l’écran
            verrouillé. iOS / Apple Health n’est pas pris en charge dans cette version.
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
          <Text style={styles.text}>{snapshotLabel(snapshot)}</Text>
          {snapshot && snapshot.records.length > 0 ? (
            <Text style={styles.mono}>
              {JSON.stringify(snapshot.records.slice(0, 3), null, 2)}
            </Text>
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
            URL de base du backend Sentinelle. Le jeton, si votre backend en exige un, est stocké dans
            le trousseau sécurisé et n’est jamais affiché ni journalisé.
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
          <Text style={styles.text}>Endpoint : {baseUrl || '—'}/api/health/records</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>4 · Envoi</Text>
          <Text style={styles.note}>
            Aucun envoi automatique : les données affichées ci-dessus ne partent que lorsque vous
            appuyez sur le bouton. {payloadPreview ? `${payloadPreview.records.length} enregistrement(s) prêt(s).` : ''}
          </Text>
          <TouchableOpacity
            style={styles.button}
            disabled={isBusy || !snapshot || snapshot.records.length === 0 || !baseUrl}
            onPress={onSend}
          >
            {busy === 'send' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Envoyer au backend</Text>
            )}
          </TouchableOpacity>
          {sendResult ? (
            <Text style={sendResult.ok ? styles.success : styles.error}>
              {sendResult.ok ? '✓' : '✕'} {sendResult.message}
            </Text>
          ) : null}
          <Text style={styles.text}>
            Dernier envoi réussi : {lastSync ?? 'jamais'}
          </Text>
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
