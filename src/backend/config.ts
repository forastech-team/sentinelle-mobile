import * as SecureStore from 'expo-secure-store';

import { backendHost, tokenMatchesHost } from './url';

const BACKEND_URL_KEY = 'sentinelle.backendUrl';
const BACKEND_TOKEN_KEY = 'sentinelle.authToken';
const BACKEND_TOKEN_HOST_KEY = 'sentinelle.authTokenHost';

export interface BackendConfig {
  baseUrl: string;
  token?: string;
  tokenHost?: string;
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

  // Jeton orphelin ou lié à un autre hôte : on le purge au lieu de le réutiliser.
  if (!tokenMatchesHost(token, tokenHost, host)) {
    if (token) {
      await SecureStore.deleteItemAsync(BACKEND_TOKEN_KEY);
      await SecureStore.deleteItemAsync(BACKEND_TOKEN_HOST_KEY);
    }
    return { baseUrl };
  }

  return {
    baseUrl,
    token: token ?? undefined,
    tokenHost: tokenHost ?? undefined,
  };
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
