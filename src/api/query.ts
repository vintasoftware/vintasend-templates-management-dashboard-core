/**
 * TanStack Query bindings.
 *
 * `openapi-react-query` lifts the fetch client into query/mutation hooks whose
 * keys, inputs, and results are derived from the same generated `paths` type.
 * The named hooks in `../hooks` are thin wrappers over this; the raw client is
 * exported too, so an app can call an endpoint the wrappers do not cover
 * without dropping out of the typed layer.
 */

import createQueryClient, { type OpenapiQueryClient } from 'openapi-react-query';
import {
  createTemplatesFetchClient,
  type TemplatesClientConfig,
  type TemplatesFetchClient,
} from './client.js';
import type { paths } from './schema.js';

/** Query/mutation hooks generated for the templates-management contract. */
export type TemplatesQueryClient = OpenapiQueryClient<paths>;

export type TemplatesClient = {
  /** The `openapi-fetch` client, for imperative calls outside React. */
  fetch: TemplatesFetchClient;
  /** The `openapi-react-query` client: `api.useQuery`, `api.useMutation`, … */
  api: TemplatesQueryClient;
};

/** Wraps an existing fetch client in the TanStack Query hooks. */
export function createTemplatesQueryClient(
  fetchClient: TemplatesFetchClient,
): TemplatesQueryClient {
  return createQueryClient(fetchClient);
}

/**
 * Builds both clients from one configuration. Create this once per app —
 * usually at module scope, or in a `useState` initialiser when the
 * configuration depends on a session — and hand it to `TemplatesProvider`.
 */
export function createTemplatesClient(config: TemplatesClientConfig): TemplatesClient {
  const fetchClient = createTemplatesFetchClient(config);

  return { fetch: fetchClient, api: createTemplatesQueryClient(fetchClient) };
}
