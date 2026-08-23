/**
 * The generated HTTP client.
 *
 * `openapi-fetch` turns the generated `paths` type into a fetch client whose
 * URLs, query parameters, and response bodies are all checked against
 * `openapi.yaml`. This module only wires in configuration: where the API lives
 * and how requests are authenticated.
 *
 * Array-valued filters (`status`, `includesAllTags`, `includesAnyOfTags`) go
 * out as repeated parameters — `?status=draft&status=active` — which is
 * `openapi-fetch`'s default for a query array and what the server's schema
 * accepts.
 *
 * On authentication: the API's own scheme is a bearer key that is a server-side
 * secret, so a browser app should point `baseUrl` at a route of its own that
 * injects the key, and leave `apiKey` unset. Set `apiKey` only where the secret
 * is already safe to hold — a server component, a route handler, a CLI.
 */

import createFetchClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';

export type TemplatesClientConfig = {
  /**
   * Origin (and optional prefix) the API is served from, such as
   * `https://notifications.example.com` or `/api/vintasend` for a same-origin
   * proxy route. A trailing slash is ignored.
   */
  baseUrl: string;

  /**
   * Bearer key for the API. Never set this in code that reaches a browser —
   * proxy through your own server instead. See the note above.
   */
  apiKey?: string;

  /**
   * Headers added to every request. Useful for a tenant header, or for a
   * session cookie's CSRF token.
   */
  headers?: Record<string, string>;

  /**
   * Per-request headers, resolved before each call. This is the hook for a
   * bring-your-own-auth setup: return an `Authorization` header from whatever
   * session your app already has. Merged over `headers`.
   */
  getHeaders?: () => Record<string, string> | Promise<Record<string, string>>;

  /**
   * Sent as `credentials` on every request. Set `'include'` when your proxy
   * authenticates with cookies from another origin.
   */
  credentials?: RequestCredentials;

  /** Replaces the global `fetch`, for tests or for a runtime that needs one. */
  fetch?: typeof globalThis.fetch;

  /**
   * `openapi-fetch` middleware, applied after the built-in auth middleware.
   * Use it for tracing, retries, or logging.
   */
  middleware?: Middleware[];
};

/** The typed client `openapi-fetch` builds from the generated schema. */
export type TemplatesFetchClient = ReturnType<typeof createFetchClient<paths>>;

function authMiddleware(config: TemplatesClientConfig): Middleware {
  return {
    async onRequest({ request }) {
      for (const [name, value] of Object.entries(config.headers ?? {})) {
        request.headers.set(name, value);
      }

      for (const [name, value] of Object.entries((await config.getHeaders?.()) ?? {})) {
        request.headers.set(name, value);
      }

      if (config.apiKey && !request.headers.has('Authorization')) {
        request.headers.set('Authorization', `Bearer ${config.apiKey}`);
      }

      return request;
    },
  };
}

/**
 * Builds the typed fetch client. Most apps want `createTemplatesClient`
 * instead, which also wires up the TanStack Query hooks.
 */
export function createTemplatesFetchClient(config: TemplatesClientConfig): TemplatesFetchClient {
  const client = createFetchClient<paths>({
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    ...(config.credentials ? { credentials: config.credentials } : {}),
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  client.use(authMiddleware(config));

  for (const middleware of config.middleware ?? []) {
    client.use(middleware);
  }

  return client;
}
