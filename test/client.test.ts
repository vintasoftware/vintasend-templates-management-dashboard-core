import { describe, expect, it, vi } from 'vitest';
import { createTemplatesFetchClient } from '../src/api/client.js';

/**
 * These cover the configuration layer this package adds on top of
 * `openapi-fetch` — base URL normalisation, authentication, and middleware
 * ordering. Request building, response parsing, and the `{ data, error }` shape
 * are `openapi-fetch`'s own behaviour and are not re-tested here.
 *
 * `openapi-fetch` hands `fetch` a `Request`, so the assertions read headers and
 * URLs back off the recorded request rather than off an init object.
 */
function recordingFetch(response?: Response) {
  const calls: Request[] = [];

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(input instanceof Request ? input : new Request(String(input), init));

    return (
      response ??
      new Response(JSON.stringify({ data: [], page: 1, pageSize: 20, hasMore: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  return { calls, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch };
}

function lastRequest(calls: Request[]): Request {
  const request = calls.at(-1);

  if (!request) {
    throw new Error('fetch was never called');
  }

  return request;
}

describe('createTemplatesFetchClient', () => {
  it('sends the request to the configured base URL', async () => {
    const { calls, fetchImpl } = recordingFetch();

    const client = createTemplatesFetchClient({
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    await client.GET('/api/v1/templates');

    expect(lastRequest(calls).url).toBe('https://api.example.com/api/v1/templates');
  });

  it('strips trailing slashes off the base URL so paths do not double up', async () => {
    const { calls, fetchImpl } = recordingFetch();

    const client = createTemplatesFetchClient({
      baseUrl: 'https://api.example.com///',
      fetch: fetchImpl,
    });

    await client.GET('/api/v1/templates');

    expect(lastRequest(calls).url).toBe('https://api.example.com/api/v1/templates');
  });

  it('sends the api key as a bearer token', async () => {
    const { calls, fetchImpl } = recordingFetch();

    const client = createTemplatesFetchClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'secret-key',
      fetch: fetchImpl,
    });

    await client.GET('/api/v1/templates');

    expect(lastRequest(calls).headers.get('Authorization')).toBe('Bearer secret-key');
  });

  it('sends no Authorization header when no key is configured', async () => {
    const { calls, fetchImpl } = recordingFetch();

    const client = createTemplatesFetchClient({
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
    });

    await client.GET('/api/v1/templates');

    expect(lastRequest(calls).headers.get('Authorization')).toBeNull();
  });

  it('sends static headers on every request', async () => {
    const { calls, fetchImpl } = recordingFetch();

    const client = createTemplatesFetchClient({
      baseUrl: 'https://api.example.com',
      headers: { 'X-Tenant': 'acme' },
      fetch: fetchImpl,
    });

    await client.GET('/api/v1/templates');
    await client.GET('/api/v1/capabilities');

    expect(calls).toHaveLength(2);
    expect(calls.every((request) => request.headers.get('X-Tenant') === 'acme')).toBe(true);
  });

  it('resolves getHeaders before each request', async () => {
    const { calls, fetchImpl } = recordingFetch();

    let token = 'first';

    const client = createTemplatesFetchClient({
      baseUrl: 'https://api.example.com',
      getHeaders: async () => ({ Authorization: `Bearer ${token}` }),
      fetch: fetchImpl,
    });

    await client.GET('/api/v1/templates');
    token = 'refreshed';
    await client.GET('/api/v1/templates');

    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer first');
    expect(calls[1]?.headers.get('Authorization')).toBe('Bearer refreshed');
  });

  it('lets getHeaders override the static headers', async () => {
    const { calls, fetchImpl } = recordingFetch();

    const client = createTemplatesFetchClient({
      baseUrl: 'https://api.example.com',
      headers: { 'X-Tenant': 'default' },
      getHeaders: () => ({ 'X-Tenant': 'per-request' }),
      fetch: fetchImpl,
    });

    await client.GET('/api/v1/templates');

    expect(lastRequest(calls).headers.get('X-Tenant')).toBe('per-request');
  });

  it('does not overwrite an Authorization header that getHeaders already set', async () => {
    const { calls, fetchImpl } = recordingFetch();

    const client = createTemplatesFetchClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'static-key',
      getHeaders: () => ({ Authorization: 'Bearer session-token' }),
      fetch: fetchImpl,
    });

    await client.GET('/api/v1/templates');

    expect(lastRequest(calls).headers.get('Authorization')).toBe('Bearer session-token');
  });

  it('applies caller-supplied middleware', async () => {
    const { calls, fetchImpl } = recordingFetch();

    const client = createTemplatesFetchClient({
      baseUrl: 'https://api.example.com',
      fetch: fetchImpl,
      middleware: [
        {
          onRequest({ request }) {
            request.headers.set('X-Trace-Id', 'trace-1');

            return request;
          },
        },
      ],
    });

    await client.GET('/api/v1/templates');

    expect(lastRequest(calls).headers.get('X-Trace-Id')).toBe('trace-1');
  });
});
