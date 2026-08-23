'use client';

/**
 * Named hooks for each read endpoint.
 *
 * These are thin wrappers over the `openapi-react-query` client, which already
 * derives its query keys, inputs, and results from the generated schema. They
 * exist for discoverability and for the shared `client` override; anything they
 * do not cover is still reachable through `useTemplatesApi().useQuery(...)`.
 *
 * Query keys are `[method, path, init]`, so a mutation can invalidate a whole
 * endpoint with `queryClient.invalidateQueries({ queryKey: ['get', path] })` —
 * which is what `TEMPLATE_PATHS` and `TAG_PATHS` below are for.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { TemplatesClient, TemplatesQueryClient } from '../api/query.js';
import type { TagListQuery, TemplateListQuery } from '../api/types.js';
import { useTemplatesClient } from '../provider.js';

export type WithClient = {
  /** Overrides the client from context, for a component outside the provider. */
  client?: TemplatesClient;
};

/** The raw generated hooks, for endpoints these wrappers do not name. */
export function useTemplatesApi(options: WithClient = {}): TemplatesQueryClient {
  return useTemplatesClient(options.client).api;
}

/**
 * Every path whose result depends on template state. A write to one template
 * can change any of them — a status change moves a row between filters, and a
 * new version changes what the collapsed listing shows — so they are
 * invalidated together.
 */
export const TEMPLATE_PATHS = [
  '/api/v1/templates',
  '/api/v1/templates/{key}',
  '/api/v1/templates/{key}/versions',
  '/api/v1/templates/{key}/versions/{version}',
  '/api/v1/templates/{key}/composition',
  '/api/v1/templates/{key}/status-history',
] as const;

/**
 * Tag paths. Templates carry their tags inline, so renaming or archiving a tag
 * changes template rows too — `useInvalidateTags` invalidates both sets.
 */
export const TAG_PATHS = ['/api/v1/tags', '/api/v1/tags/{slug}'] as const;

/**
 * Query options passed straight through to TanStack Query. Typed loosely on
 * purpose: the exact option type depends on the endpoint's response, and the
 * generated client narrows it at the call site.
 */
type QueryOptions = Record<string, unknown>;

export type QueryHookOptions = WithClient & { query?: QueryOptions };

// --- templates -------------------------------------------------------------

/**
 * A page of templates for a filter set. Pass `filters.query`.
 *
 * One row per key by default: a row in the store is a *version*, and
 * `mostRecentActiveVersion` defaults to true server-side. Send it as `false`
 * for the raw listing with every version included.
 */
export function useTemplatesQuery(query: TemplateListQuery, options: QueryHookOptions = {}) {
  return useTemplatesApi(options).useQuery(
    'get',
    '/api/v1/templates',
    { params: { query } },
    options.query,
  );
}

/**
 * One template. `version` selects a specific one; omitting it asks for the
 * latest, which is this API's documented shorthand rather than "all versions".
 *
 * Pass `null` as the key to hold the query until one is picked.
 */
export function useTemplate(
  key: string | null | undefined,
  version?: number | null,
  options: QueryHookOptions = {},
) {
  return useTemplatesApi(options).useQuery(
    'get',
    '/api/v1/templates/{key}',
    { params: { path: { key: key ?? '' }, query: { version: version ?? null } } },
    { enabled: Boolean(key), ...options.query },
  );
}

/** Every version of a template, newest first. Unpaginated. */
export function useTemplateVersions(
  key: string | null | undefined,
  options: QueryHookOptions = {},
) {
  return useTemplatesApi(options).useQuery(
    'get',
    '/api/v1/templates/{key}/versions',
    { params: { path: { key: key ?? '' } } },
    { enabled: Boolean(key), ...options.query },
  );
}

/** One specific version, by number. */
export function useTemplateVersion(
  key: string | null | undefined,
  version: number | null | undefined,
  options: QueryHookOptions = {},
) {
  return useTemplatesApi(options).useQuery(
    'get',
    '/api/v1/templates/{key}/versions/{version}',
    { params: { path: { key: key ?? '', version: version ?? 0 } } },
    { enabled: Boolean(key) && typeof version === 'number', ...options.query },
  );
}

/**
 * How a template resolves through its inheritance chain: which parent supplied
 * each block, and what the composed result is. Fails with
 * `TEMPLATE_COMPOSITION_ERROR` when the chain cannot be resolved.
 */
export function useTemplateComposition(
  key: string | null | undefined,
  version?: number | null,
  options: QueryHookOptions = {},
) {
  return useTemplatesApi(options).useQuery(
    'get',
    '/api/v1/templates/{key}/composition',
    { params: { path: { key: key ?? '' }, query: { version: version ?? null } } },
    { enabled: Boolean(key), ...options.query },
  );
}

/**
 * The status changes a template has been through.
 *
 * This is the one endpoint where omitting `version` means *every* version
 * rather than the latest — it returns the whole key's history.
 */
export function useTemplateStatusHistory(
  key: string | null | undefined,
  version?: number | null,
  options: QueryHookOptions = {},
) {
  return useTemplatesApi(options).useQuery(
    'get',
    '/api/v1/templates/{key}/status-history',
    { params: { path: { key: key ?? '' }, query: { version: version ?? null } } },
    { enabled: Boolean(key), ...options.query },
  );
}

// --- tags ------------------------------------------------------------------

/**
 * A page of tags. A tag picker wants `{ status: ['active'] }`: archived tags
 * remain attached to the templates carrying them and can still be filtered on,
 * they are simply no longer offered.
 */
export function useTagsQuery(query: TagListQuery = {}, options: QueryHookOptions = {}) {
  return useTemplatesApi(options).useQuery(
    'get',
    '/api/v1/tags',
    { params: { query } },
    options.query,
  );
}

/** One tag by slug. */
export function useTag(slug: string | null | undefined, options: QueryHookOptions = {}) {
  return useTemplatesApi(options).useQuery(
    'get',
    '/api/v1/tags/{slug}',
    { params: { path: { slug: slug ?? '' } } },
    { enabled: Boolean(slug), ...options.query },
  );
}

// --- system ----------------------------------------------------------------

/**
 * What the configured backend can filter and sort by.
 *
 * Read it with `supportsFilter` and `supportsOrdering` from
 * `./capabilities.js` — the two namespaces have opposite defaults.
 *
 * Capabilities change only when the service is reconfigured, so this is cached
 * for an hour by default.
 */
export function useCapabilities(options: QueryHookOptions = {}) {
  return useTemplatesApi(options).useQuery(
    'get',
    '/api/v1/capabilities',
    {},
    { staleTime: 60 * 60 * 1000, ...options.query },
  );
}

/** Liveness probe. */
export function useHealth(options: QueryHookOptions = {}) {
  return useTemplatesApi(options).useQuery('get', '/health', {}, options.query);
}

// --- invalidation ----------------------------------------------------------

/**
 * Invalidates every template-derived query. Returned as a callback so mutations
 * — and your own imperative code — can refresh the list after a write.
 */
export function useInvalidateTemplates() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all(
      TEMPLATE_PATHS.map((path) => queryClient.invalidateQueries({ queryKey: ['get', path] })),
    );
  }, [queryClient]);
}

/**
 * Invalidates tag queries, and the template ones with them: templates carry
 * their tags inline, so a renamed or archived tag is stale data on every
 * template row that has it.
 */
export function useInvalidateTags() {
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await Promise.all(
      [...TAG_PATHS, ...TEMPLATE_PATHS].map((path) =>
        queryClient.invalidateQueries({ queryKey: ['get', path] }),
      ),
    );
  }, [queryClient]);
}
