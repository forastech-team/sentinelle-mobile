import type { HealthPayload } from '../health/payload';
import type { BackendConfig } from './config';
import { healthEndpoint, validateBackendUrl } from './url';

const REQUEST_TIMEOUT_MS = 12_000;

export interface SendResult {
  ok: boolean;
  status: number;
  message: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageFromBody(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message.slice(0, 200);
    }
  }
  return status >= 500 ? 'Erreur temporaire du backend.' : 'Le backend a refusé les données.';
}

async function postOnce(
  endpoint: string,
  payload: HealthPayload,
  token: string | undefined,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

/** Envoie le payload au backend. Une seule tentative est répétée en cas d'erreur temporaire. */
export async function sendHealthPayload(
  config: BackendConfig,
  payload: HealthPayload,
): Promise<SendResult> {
  const baseUrl = validateBackendUrl(config.baseUrl);
  const endpoint = healthEndpoint(baseUrl);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { status, body } = await postOnce(endpoint, payload, config.token);
      if (status >= 200 && status < 300) {
        return { ok: true, status, message: 'Données envoyées au backend.' };
      }
      if ((status === 429 || status >= 500) && attempt === 0) {
        await delay(600);
        continue;
      }
      return { ok: false, status, message: messageFromBody(body, status) };
    } catch (error) {
      if (attempt === 0) {
        await delay(600);
        continue;
      }
      const aborted = error instanceof Error && error.name === 'AbortError';
      return {
        ok: false,
        status: 0,
        message: aborted
          ? 'Délai dépassé : backend joignable ?'
          : 'Connexion impossible : vérifiez le réseau et l’URL du backend.',
      };
    }
  }

  return { ok: false, status: 0, message: 'Envoi impossible.' };
}
