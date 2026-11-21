import * as SecureStore from 'expo-secure-store';

import { backendHost } from './url';

const BACKEND_URL_KEY = 'sentinelle.backendUrl';
const BACKEND_TOKEN_KEY = 'sentinelle.authToken';
const BACKEND_TOKEN_HOST_KEY = 'sentinelle.authTokenHost';

export interface BackendConfig {
  baseUrl: string;
  token?: string;
}

/** L'URL peut venir de EXPO_PUBLIC_BACKEND_URL ou être saisie par l'utilisateur. */
export async function loadBackendConfig(): Promise<BackendConfig> {
  const storedUrl = await SecureStore.getItemAsync(BACKEND_URL_KEY);
  const baseUrl = storedUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? '';
  const host = backendHost(baseUrl);

  if (!host) {
    return { baseUrl };
  }

  const token = await SecureStore.getItemAsync(BACKEND_TOKEN_KEY);
  const tokenHost = await SecureStore.getItemAsync(BACKEND_TOKEN_HOST_KEY);

  // Un jeton n'est jamais réutilisé pour un autre hôte : évite l'exfiltration si l'URL change.
  if (!token || (tokenHost && tokenHost !== host)) {
    return { baseUrl };
  }

  return { baseUrl, token };
}

export async function saveBackendUrl(baseUrl: string): Promise<void> {
  await SecureStore.setItemAsync(BACKEND_URL_KEY, baseUrl.trim());
}

/** Enregistre le jeton avec l'hôte auquel il est associé. */
export async function saveBackendToken(token: string, baseUrl: string): Promise<void> {
  const host = backendHost(baseUrl);
  if (!host) {
    throw new Error("L'URL du backend est invalide.");
  }

  if (token) {
    await SecureStore.setItemAsync(BACKEND_TOKEN_KEY, token);
    await SecureStore.setItemAsync(BACKEND_TOKEN_HOST_KEY, host);
  } else {
    await SecureStore.deleteItemAsync(BACKEND_TOKEN_KEY);
    await SecureStore.deleteItemAsync(BACKEND_TOKEN_HOST_KEY);
  }
}
