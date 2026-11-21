export const HEALTH_ENDPOINT_PATH = '/api/health/records';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

export class BackendConfigurationError extends Error {}

/** HTTPS obligatoire, sauf pour les hôtes locaux de développement. */
export function validateBackendUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) {
    throw new BackendConfigurationError("L'URL du backend est vide.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BackendConfigurationError("L'URL du backend est invalide.");
  }

  const isLocal = LOCAL_HOSTS.has(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new BackendConfigurationError(
      "Utilisez une URL HTTPS (HTTP autorisé uniquement pour localhost/émulateur).",
    );
  }

  return url.toString().replace(/\/+$/, '');
}

export function healthEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${HEALTH_ENDPOINT_PATH}`;
}
