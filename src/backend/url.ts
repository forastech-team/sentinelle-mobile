export const HEALTH_ENDPOINT_PATH = '/api/health/records';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2', '[::1]', '::1']);

export class BackendConfigurationError extends Error {}

function isDevelopment(): boolean {
  return typeof globalThis !== 'undefined' &&
    Boolean((globalThis as { __DEV__?: boolean }).__DEV__);
}

/**
 * Valide l'URL de base du backend. L'URL doit être une origine (schéma + hôte + port éventuel),
 * sans chemin, query, fragment ni identifiants : c'est le contrat `{BASE_URL}/api/health/records`.
 */
export function validateBackendUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) {
    throw new BackendConfigurationError("L'URL du backend est vide.");
  }
  // new URL() convertit les IDN en punycode : on refuse le texte non ASCII avant normalisation.
  if (/[^\x00-\x7F]/.test(value)) {
    throw new BackendConfigurationError("Le nom d'hôte doit être en ASCII (pas de nom de domaine internationalisé).");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BackendConfigurationError("L'URL du backend est invalide.");
  }

  if (url.username || url.password) {
    throw new BackendConfigurationError(
      "N'utilisez pas d'identifiants dans l'URL : saisissez le jeton dans le champ dédié.",
    );
  }
  if (url.search || url.hash) {
    throw new BackendConfigurationError("L'URL du backend ne doit pas contenir de query ni de fragment.");
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new BackendConfigurationError("L'URL de base doit être une origine, sans chemin.");
  }
  if (/[^\x00-\x7F]/.test(url.hostname)) {
    throw new BackendConfigurationError("Le nom d'hôte doit être en ASCII (pas de nom de domaine internationalisé).");
  }

  const isLocal = LOCAL_HOSTS.has(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal && isDevelopment())) {
    throw new BackendConfigurationError(
      "Utilisez une URL HTTPS (HTTP autorisé uniquement en développement sur localhost/émulateur).",
    );
  }

  return `${url.protocol}//${url.host}`;
}

export function healthEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${HEALTH_ENDPOINT_PATH}`;
}

export function backendHost(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).host;
  } catch {
    return null;
  }
}

/** Un jeton n'est valide que s'il a été enregistré avec l'hôte courant. */
export function tokenMatchesHost(
  token: string | null | undefined,
  tokenHost: string | null | undefined,
  host: string,
): boolean {
  return Boolean(token) && tokenHost === host;
}

export interface StoredBackend {
  baseUrl: string;
  token?: string;
  tokenHost?: string;
}

/**
 * Vrai si l'utilisateur tente d'enregistrer le jeton déjà présent dans le trousseau
 * sous un nouvel hôte. Dans ce cas il faut exiger une nouvelle saisie, jamais réassigner.
 */
export function isTokenRebind(existing: StoredBackend, newToken: string, newHost: string): boolean {
  return Boolean(existing.token) && newToken === existing.token && existing.tokenHost !== newHost;
}

export type SendTargetCheck =
  | { ok: true; target: { baseUrl: string; token?: string } }
  | { ok: false; message: string };

/**
 * Dernier rempart avant l'envoi : l'URL affichée doit être celle enregistrée, et le jeton
 * (relu du trousseau) doit être lié à cet hôte. Une URL modifiée à l'écran mais non
 * enregistrée ne peut donc jamais recevoir le jeton ni les données de santé.
 */
export function checkSendTarget(displayUrl: string, stored: StoredBackend): SendTargetCheck {
  let validated: string;
  try {
    validated = validateBackendUrl(displayUrl);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "L'URL du backend est invalide.",
    };
  }

  const targetHost = backendHost(validated);
  if (!targetHost) {
    return { ok: false, message: "L'URL du backend est invalide." };
  }
  if (backendHost(stored.baseUrl) !== targetHost) {
    return {
      ok: false,
      message:
        "Enregistrez la configuration avant l'envoi : l'URL affichée diffère de l'URL enregistrée.",
    };
  }
  if (stored.token && !tokenMatchesHost(stored.token, stored.tokenHost, targetHost)) {
    return {
      ok: false,
      message: 'Jeton invalide pour cet hôte : saisissez un jeton dédié puis enregistrez.',
    };
  }

  return {
    ok: true,
    target: { baseUrl: validated, ...(stored.token ? { token: stored.token } : {}) },
  };
}
