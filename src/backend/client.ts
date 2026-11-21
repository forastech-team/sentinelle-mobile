import type { HealthPayload } from '../health/payload';
import type { BackendConfig } from './config';
import { healthEndpoint, validateBackendUrl } from './url';

const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_MS = 600;
const MAX_RETRY_MS = 5_000;

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

function retryDelayMs(headers: Headers): number {
  const raw = headers.get('retry-after');
  if (!raw) {
    return DEFAULT_RETRY_MS;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return Math.min(MAX_RETRY_MS, Math.max(0, seconds * 1000));
  }
  const timestamp = Date.parse(raw);
  if (!Number.isNaN(timestamp)) {
    return Math.min(MAX_RETRY_MS, Math.max(0, timestamp - Date.now()));
  }
  return DEFAULT_RETRY_MS;
}

/** Clé stable pour qu'un retry ne crée pas de doublon côté backend. */
function idempotencyKey(payload: HealthPayload): string {
  return `${payload.source}:${payload.window.from}:${payload.window.to}:${payload.generatedAt}`;
}

async function postOnce(
  endpoint: string,
  payload: HealthPayload,
  token: string | undefined,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey(payload),
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
    return { status: response.status, body, headers: response.headers };
  } finally {
    clearTimeout(timeout);
  }
}

/** Envoie le payload au backend. Seuls 429 et 5xx donnent lieu à un second essai. */
export async function sendHealthPayload(
  config: BackendConfig,
  payload: HealthPayload,
): Promise<SendResult> {
  let baseUrl: string;
  try {
    baseUrl = validateBackendUrl(config.baseUrl);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "L'URL du backend est invalide.",
    };
  }

  const endpoint = healthEndpoint(baseUrl);
  const token = config.token?.trim() || undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { status, body, headers } = await postOnce(endpoint, payload, token);

      if (status >= 200 && status < 300) {
        if (body && typeof body === 'object' && 'ok' in body && body.ok === false) {
          return { ok: false, status, message: messageFromBody(body, status) };
        }
        if (
          body &&
          typeof body === 'object' &&
          'received' in body &&
          typeof body.received === 'number' &&
          body.received < payload.records.length
        ) {
          return {
            ok: false,
            status,
            message: 'Le backend a reçu moins d’enregistrements que prévu.',
          };
        }
        return { ok: true, status, message: 'Données envoyées au backend.' };
      }

      if ((status === 429 || status >= 500) && attempt === 0) {
        await delay(retryDelayMs(headers));
        continue;
      }
      return { ok: false, status, message: messageFromBody(body, status) };
    } catch (error) {
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
