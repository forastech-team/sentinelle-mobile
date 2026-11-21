import * as SecureStore from 'expo-secure-store';

const BACKEND_URL_KEY = 'sentinelle.backendUrl';
const BACKEND_TOKEN_KEY = 'sentinelle.authToken';

export interface BackendConfig {
  baseUrl: string;
  token?: string;
}

/** L'URL peut venir de EXPO_PUBLIC_BACKEND_URL ou être saisie par l'utilisateur. */
export async function loadBackendConfig(): Promise<BackendConfig> {
  const storedUrl = await SecureStore.getItemAsync(BACKEND_URL_KEY);
  const storedToken = await SecureStore.getItemAsync(BACKEND_TOKEN_KEY);
  const baseUrl = storedUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? '';
  return {
    baseUrl,
    ...(storedToken ? { token: storedToken } : {}),
  };
}

export async function saveBackendUrl(baseUrl: string): Promise<void> {
  await SecureStore.setItemAsync(BACKEND_URL_KEY, baseUrl.trim());
}

export async function saveBackendToken(token: string): Promise<void> {
  if (token) {
    await SecureStore.setItemAsync(BACKEND_TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(BACKEND_TOKEN_KEY);
  }
}
