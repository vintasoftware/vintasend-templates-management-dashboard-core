import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTemplatesClient, type TemplatesClient } from '../src/api/query.js';
import {
  useArchiveTemplate,
  useCreateTemplateVersion,
  usePreviewTemplate,
  useSetTemplateTags,
  useUpdateTag,
} from '../src/hooks/mutations.js';
import {
  useCapabilities,
  useInvalidateTemplates,
  useTag,
  useTemplate,
  useTemplateComposition,
  useTemplateStatusHistory,
  useTemplatesQuery,
  useTemplateVersion,
  useTemplateVersions,
} from '../src/hooks/queries.js';
import { useFilteredTags } from '../src/hooks/use-filtered-tags.js';
import { useFilteredTemplates } from '../src/hooks/use-filtered-templates.js';
import { TemplatesProvider, useTemplatesClient } from '../src/provider.js';

/**
 * Covers what this package adds on top of `openapi-react-query`: the provider,
 * the `enabled` gating on key-less queries, the `client` override, cache
 * invalidation after a write, and the URL-filters-to-list-query hooks.
 *
 * Fetching, parsing, caching, and error propagation belong to
 * `openapi-react-query` and the generated schema, and are not re-tested here.
 */

function template(key: string, version = 1) {
  return {
    id: `${key}-v${version}`,
    key,
    version,
    name: `Template ${key}`,
    description: '',
    templateManagedBackend: 'db',
    bodyTemplate: '<p>hi</p>',
    subjectTemplate: 'Hi',
    preheaderTemplate: null,
    status: 'draft',
    tenant: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    allowedTransitions: ['active', 'archived'],
    isAbstract: false,
  };
}

function tag(slug: string) {
  return {
    id: `tag-${slug}`,
    text: slug,
    slug,
    status: 'active',
    tenant: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

type Handler = (url: URL) => { status?: number; body: unknown };
type Route = { method: string; pattern: RegExp; handler: Handler };

const DEFAULT_CAPABILITIES = {
  'orderBy.key': true,
  'orderBy.name': true,
  'orderBy.createdAt': true,
};

function createStubApi(overrides: Route[] = []) {
  const requests: { method: string; url: URL }[] = [];

  const routes: Route[] = [
    ...overrides,
    {
      method: 'GET',
      pattern: /^\/api\/v1\/templates$/,
      handler: (url) => ({
        body: {
          data: [template('welcome'), template('reset')],
          page: Number(url.searchParams.get('page') ?? 1),
          pageSize: Number(url.searchParams.get('pageSize') ?? 20),
          hasMore: url.searchParams.get('page') !== '3',
        },
      }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/tags$/,
      handler: (url) => ({
        body: {
          data: [tag('marketing')],
          page: Number(url.searchParams.get('page') ?? 1),
          pageSize: 20,
          hasMore: false,
        },
      }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/capabilities$/,
      handler: () => ({ body: { data: DEFAULT_CAPABILITIES } }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/templates\/[^/]+\/versions$/,
      handler: () => ({ body: { data: [template('welcome', 2), template('welcome', 1)] } }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/templates\/[^/]+\/versions\/\d+$/,
      handler: () => ({ body: { data: template('welcome', 2) } }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/templates\/[^/]+\/status-history$/,
      handler: () => ({ body: { data: [] } }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/templates\/[^/]+\/composition$/,
      handler: () => ({ body: { data: { key: 'welcome', version: 1, chain: [], blocks: {} } } }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/templates\/[^/]+$/,
      handler: () => ({ body: { data: template('welcome') } }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/v1\/tags\/[^/]+$/,
      handler: () => ({ body: { data: tag('marketing') } }),
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/templates\/[^/]+\/versions$/,
      handler: () => ({ status: 201, body: { data: template('welcome', 2) } }),
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/templates\/[^/]+\/archive$/,
      handler: () => ({ body: { data: { ...template('welcome'), status: 'archived' } } }),
    },
    {
      method: 'POST',
      pattern: /^\/api\/v1\/templates\/[^/]+\/preview$/,
      handler: () => ({ body: { data: { subject: 'Hi', body: '<p>hi</p>', preheader: null } } }),
    },
    {
      method: 'PUT',
      pattern: /^\/api\/v1\/templates\/[^/]+\/tags$/,
      handler: () => ({ body: { data: template('welcome') } }),
    },
    {
      method: 'PATCH',
      pattern: /^\/api\/v1\/tags\/[^/]+$/,
      handler: () => ({ body: { data: tag('renamed') } }),
    },
  ];

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);

    requests.push({ method: request.method, url });

    const route = routes.find(
      (candidate) => candidate.method === request.method && candidate.pattern.test(url.pathname),
    );

    if (!route) {
      return new Response(
        JSON.stringify({
          error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${url.pathname}` },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { status = 200, body } = route.handler(url);

    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  return { requests, fetchImpl: fetchImpl as unknown as typeof globalThis.fetch };
}

function setup(overrides: Route[] = []) {
  const stub = createStubApi(overrides);

  const client = createTemplatesClient({
    baseUrl: 'https://api.example.com',
    fetch: stub.fetchImpl,
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TemplatesProvider client={client}>{children}</TemplatesProvider>
      </QueryClientProvider>
    );
  }

  const countGets = (pathname: string) =>
    stub.requests.filter((r) => r.method === 'GET' && r.url.pathname === pathname).length;

  return { ...stub, client, queryClient, wrapper, countGets };
}

beforeEach(() => {
  window.history.replaceState({}, '', '/templates');
});

describe('TemplatesProvider', () => {
  it('hands the client to the hooks below it', () => {
    const { client, wrapper } = setup();

    const { result } = renderHook(() => useTemplatesClient(), { wrapper });

    expect(result.current).toBe(client);
  });

  it('explains what to do when a hook is used outside the provider', () => {
    const queryClient = new QueryClient();

    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    expect(() => renderHook(() => useTemplatesClient(), { wrapper: Wrapper })).toThrow(
      /TemplatesProvider/,
    );
  });

  it('lets an explicit client stand in for the provider', () => {
    const { client } = setup();
    const queryClient = new QueryClient();

    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    const { result } = renderHook(() => useTemplatesClient(client), { wrapper: Wrapper });

    expect(result.current).toBe(client);
  });
});

describe('key-gated hooks', () => {
  it('holds the template query until a key is picked', () => {
    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useTemplate(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(requests).toHaveLength(0);
  });

  it('fires once the key arrives', async () => {
    const { wrapper, requests } = setup();

    const { result, rerender } = renderHook(({ key }: { key: string | null }) => useTemplate(key), {
      wrapper,
      initialProps: { key: null as string | null },
    });

    expect(requests).toHaveLength(0);

    rerender({ key: 'welcome' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests.at(-1)?.url.pathname).toBe('/api/v1/templates/welcome');
  });

  it('holds the versions query until a key is picked', () => {
    const { wrapper, requests } = setup();

    renderHook(() => useTemplateVersions(undefined), { wrapper });

    expect(requests).toHaveLength(0);
  });

  it('holds the single-version query until both key and version are known', () => {
    const { wrapper, requests } = setup();

    renderHook(() => useTemplateVersion('welcome', null), { wrapper });

    expect(requests).toHaveLength(0);
  });

  it('fires the single-version query once both are known', async () => {
    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useTemplateVersion('welcome', 2), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests.at(-1)?.url.pathname).toBe('/api/v1/templates/welcome/versions/2');
  });

  it('holds the tag query until a slug is picked', () => {
    const { wrapper, requests } = setup();

    renderHook(() => useTag(null), { wrapper });

    expect(requests).toHaveLength(0);
  });

  it('holds the composition query until a key is picked', () => {
    const { wrapper, requests } = setup();

    renderHook(() => useTemplateComposition(null), { wrapper });

    expect(requests).toHaveLength(0);
  });

  it('sends the version as a query parameter on the composition endpoint', async () => {
    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useTemplateComposition('welcome', 2), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const call = requests.at(-1);

    expect(call?.url.pathname).toBe('/api/v1/templates/welcome/composition');
    expect(call?.url.searchParams.get('version')).toBe('2');
  });

  it('holds the status-history query until a key is picked', () => {
    const { wrapper, requests } = setup();

    renderHook(() => useTemplateStatusHistory(undefined), { wrapper });

    expect(requests).toHaveLength(0);
  });

  it('asks for the whole history when no version is given, as this endpoint alone does', async () => {
    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useTemplateStatusHistory('welcome'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests.at(-1)?.url.pathname).toBe('/api/v1/templates/welcome/status-history');
  });
});

describe('invalidation', () => {
  it('refetches the template list after a new version is created', async () => {
    const { wrapper, countGets } = setup();

    const { result } = renderHook(
      () => ({
        list: useTemplatesQuery({ page: 1, pageSize: 20 }),
        createVersion: useCreateTemplateVersion(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    const before = countGets('/api/v1/templates');

    await act(async () => {
      await result.current.createVersion.mutateAsync({
        params: { path: { key: 'welcome' } },
        body: { bodyTemplate: '<p>new</p>' },
      });
    });

    await waitFor(() => expect(countGets('/api/v1/templates')).toBeGreaterThan(before));
  });

  it('refetches a template detail after a status change', async () => {
    const { wrapper, countGets } = setup();

    const { result } = renderHook(
      () => ({ detail: useTemplate('welcome'), archive: useArchiveTemplate() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    const before = countGets('/api/v1/templates/welcome');

    await act(async () => {
      await result.current.archive.mutateAsync({ params: { path: { key: 'welcome' } }, body: {} });
    });

    await waitFor(() => expect(countGets('/api/v1/templates/welcome')).toBeGreaterThan(before));
  });

  it('refetches the version list after a status change, since a row moved', async () => {
    const { wrapper, countGets } = setup();

    const { result } = renderHook(
      () => ({ versions: useTemplateVersions('welcome'), archive: useArchiveTemplate() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.versions.isSuccess).toBe(true));

    const before = countGets('/api/v1/templates/welcome/versions');

    await act(async () => {
      await result.current.archive.mutateAsync({ params: { path: { key: 'welcome' } }, body: {} });
    });

    await waitFor(() =>
      expect(countGets('/api/v1/templates/welcome/versions')).toBeGreaterThan(before),
    );
  });

  it('refetches templates after a tag is renamed, because templates carry tags inline', async () => {
    const { wrapper, countGets } = setup();

    const { result } = renderHook(
      () => ({ list: useTemplatesQuery({ page: 1, pageSize: 20 }), rename: useUpdateTag() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    const before = countGets('/api/v1/templates');

    await act(async () => {
      await result.current.rename.mutateAsync({
        params: { path: { slug: 'marketing' } },
        body: { text: 'Marketing' },
      });
    });

    await waitFor(() => expect(countGets('/api/v1/templates')).toBeGreaterThan(before));
  });

  it('refetches templates after a template’s tags are replaced', async () => {
    const { wrapper, countGets } = setup();

    const { result } = renderHook(
      () => ({ list: useTemplatesQuery({ page: 1, pageSize: 20 }), setTags: useSetTemplateTags() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    const before = countGets('/api/v1/templates');

    await act(async () => {
      await result.current.setTags.mutateAsync({
        params: { path: { key: 'welcome' } },
        body: { tags: ['marketing'] },
      });
    });

    await waitFor(() => expect(countGets('/api/v1/templates')).toBeGreaterThan(before));
  });

  it('does not invalidate anything after a preview, which changes nothing', async () => {
    const { wrapper, requests, countGets } = setup();

    const { result } = renderHook(
      () => ({ list: useTemplatesQuery({ page: 1, pageSize: 20 }), preview: usePreviewTemplate() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    const before = countGets('/api/v1/templates');

    await act(async () => {
      await result.current.preview.mutateAsync({
        params: { path: { key: 'welcome' } },
        body: { context: {} },
      });
    });

    // Give an invalidation a chance to happen before asserting it did not.
    await waitFor(() =>
      expect(requests.some((r) => r.url.pathname === '/api/v1/templates/welcome/preview')).toBe(
        true,
      ),
    );

    expect(countGets('/api/v1/templates')).toBe(before);
  });

  it('runs the caller onSuccess as well as the invalidation', async () => {
    const onSuccess = vi.fn();
    const { wrapper } = setup();

    const { result } = renderHook(() => useArchiveTemplate({ mutation: { onSuccess } }), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ params: { path: { key: 'welcome' } }, body: {} });
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('exposes an imperative invalidator', async () => {
    const { wrapper, countGets } = setup();

    const { result } = renderHook(
      () => ({
        list: useTemplatesQuery({ page: 1, pageSize: 20 }),
        invalidate: useInvalidateTemplates(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    const before = countGets('/api/v1/templates');

    await act(async () => {
      await result.current.invalidate();
    });

    await waitFor(() => expect(countGets('/api/v1/templates')).toBeGreaterThan(before));
  });
});

describe('useFilteredTemplates', () => {
  it('reads the filters from the URL and fetches with them', async () => {
    window.history.replaceState({}, '', '/templates?status=draft&page=2');

    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.templates).toHaveLength(2));

    const listCall = requests.filter((r) => r.url.pathname === '/api/v1/templates').at(-1);

    expect(listCall?.url.searchParams.getAll('status')).toEqual(['draft']);
    expect(listCall?.url.searchParams.get('page')).toBe('2');
    expect(result.current.filters).toEqual({ status: ['draft'] });
  });

  it('sends a multi-status filter as repeated parameters', async () => {
    window.history.replaceState({}, '', '/templates?status=draft&status=active');

    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const listCall = requests.filter((r) => r.url.pathname === '/api/v1/templates').at(-1);

    expect(listCall?.url.searchParams.getAll('status')).toEqual(['draft', 'active']);
  });

  it('returns an empty list while loading rather than undefined', () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    expect(result.current.templates).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('reports a next page from hasMore', async () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.hasPreviousPage).toBe(false);
  });

  it('advances a page and refetches', async () => {
    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.nextPage());

    await waitFor(() => expect(result.current.page).toBe(2));
    await waitFor(() =>
      expect(
        requests
          .filter((r) => r.url.pathname === '/api/v1/templates')
          .at(-1)
          ?.url.searchParams.get('page'),
      ).toBe('2'),
    );
  });

  it('does not go back past the first page', async () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.previousPage());

    expect(result.current.page).toBe(1);
  });

  it('goes back a page from further in', async () => {
    window.history.replaceState({}, '', '/templates?page=3');

    const { wrapper } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPreviousPage).toBe(true);

    act(() => result.current.previousPage());

    await waitFor(() => expect(result.current.page).toBe(2));
  });

  it('does not advance past the last page', async () => {
    window.history.replaceState({}, '', '/templates?page=3');

    const { wrapper } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(false);

    act(() => result.current.nextPage());

    expect(result.current.page).toBe(3);
  });

  it('refetches on demand', async () => {
    const { wrapper, countGets } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = countGets('/api/v1/templates');

    act(() => result.current.refetch());

    await waitFor(() => expect(countGets('/api/v1/templates')).toBeGreaterThan(before));
  });

  it('refetches when a filter changes', async () => {
    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setFilter('name', 'Welcome'));

    await waitFor(() =>
      expect(
        requests
          .filter((r) => r.url.pathname === '/api/v1/templates')
          .at(-1)
          ?.url.searchParams.get('name'),
      ).toBe('Welcome'),
    );
  });

  describe('sortable columns', () => {
    it('lists only the fields the backend declares it can sort by', async () => {
      const { wrapper } = setup();

      const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

      await waitFor(() => expect(result.current.sortableFields.length).toBeGreaterThan(0));

      expect(result.current.sortableFields).toEqual(['key', 'name', 'createdAt']);
    });

    it('reports a declared field as sortable', async () => {
      const { wrapper } = setup();

      const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

      await waitFor(() => expect(result.current.canSortBy('name')).toBe(true));
    });

    it('reports an undeclared field as not sortable, since asking would be a 400', async () => {
      const { wrapper } = setup();

      const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

      await waitFor(() => expect(result.current.sortableFields.length).toBeGreaterThan(0));

      expect(result.current.canSortBy('version')).toBe(false);
      expect(result.current.canSortBy('status')).toBe(false);
    });

    it('offers nothing before the capabilities have loaded', () => {
      const { wrapper } = setup();

      const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

      expect(result.current.sortableFields).toEqual([]);
      expect(result.current.canSortBy('name')).toBe(false);
    });

    it('offers nothing when a backend declares no ordering at all', async () => {
      const { wrapper } = setup([
        {
          method: 'GET',
          pattern: /^\/api\/v1\/capabilities$/,
          handler: () => ({ body: { data: {} } }),
        },
      ]);

      const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.sortableFields).toEqual([]);
    });

    it('skips the capabilities request when asked to', async () => {
      const { wrapper, requests } = setup();

      const { result } = renderHook(() => useFilteredTemplates({ skipCapabilities: true }), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(requests.some((r) => r.url.pathname === '/api/v1/capabilities')).toBe(false);
      expect(result.current.sortableFields).toEqual([]);
    });
  });

  it('does not refetch in a loop when options are passed as inline literals', async () => {
    // A caller writing `{ defaultFilters: { … } }` inline hands the hook a new
    // object every render. If that reached the query key by identity rather
    // than by value, the query would refetch forever.
    const { wrapper, countGets } = setup();

    const { result, rerender } = renderHook(
      () => useFilteredTemplates({ defaultFilters: { templateManagedBackend: 'db' } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender();
    rerender();
    rerender();

    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(countGets('/api/v1/templates')).toBe(1);
  });

  it('exposes the error when the request fails', async () => {
    const { wrapper } = setup([
      {
        method: 'GET',
        pattern: /^\/api\/v1\/templates$/,
        handler: () => ({
          status: 401,
          body: { error: { code: 'UNAUTHORIZED', message: 'Bad key.' } },
        }),
      },
    ]);

    const { result } = renderHook(() => useFilteredTemplates(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.templates).toEqual([]);
    expect((result.current.error as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });
});

describe('useFilteredTags', () => {
  it('reads tag filters from the URL and fetches with them', async () => {
    window.history.replaceState({}, '', '/tags?status=active&search=promo');

    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useFilteredTags(), { wrapper });

    await waitFor(() => expect(result.current.tags).toHaveLength(1));

    const call = requests.filter((r) => r.url.pathname === '/api/v1/tags').at(-1);

    expect(call?.url.searchParams.getAll('status')).toEqual(['active']);
    expect(call?.url.searchParams.get('search')).toBe('promo');
  });

  it('reads prefixed parameters when sharing a URL with the template list', async () => {
    window.history.replaceState({}, '', '/dashboard?status=draft&tagSearch=promo');

    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useFilteredTags({ paramPrefix: 'tag' }), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const call = requests.filter((r) => r.url.pathname === '/api/v1/tags').at(-1);

    expect(call?.url.searchParams.get('search')).toBe('promo');
    expect(call?.url.searchParams.has('status')).toBe(false);
  });

  it('returns an empty list while loading', () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useFilteredTags(), { wrapper });

    expect(result.current.tags).toEqual([]);
  });

  it('reports no next page when the backend says the page was not full', async () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useFilteredTags(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasNextPage).toBe(false);
  });

  it('advances and goes back a page', async () => {
    const { wrapper } = setup([
      {
        method: 'GET',
        pattern: /^\/api\/v1\/tags$/,
        handler: (url) => ({
          body: {
            data: [tag('marketing')],
            page: Number(url.searchParams.get('page') ?? 1),
            pageSize: 20,
            hasMore: url.searchParams.get('page') !== '2',
          },
        }),
      },
    ]);

    const { result } = renderHook(() => useFilteredTags(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);

    act(() => result.current.nextPage());
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.previousPage());
    await waitFor(() => expect(result.current.page).toBe(1));
  });

  it('does not go back past the first page', async () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useFilteredTags(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.previousPage());

    expect(result.current.page).toBe(1);
  });

  it('refetches on demand', async () => {
    const { wrapper, countGets } = setup();

    const { result } = renderHook(() => useFilteredTags(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = countGets('/api/v1/tags');

    act(() => result.current.refetch());

    await waitFor(() => expect(countGets('/api/v1/tags')).toBeGreaterThan(before));
  });

  it('does not fetch capabilities, which only the template list needs', async () => {
    const { wrapper, requests } = setup();

    const { result } = renderHook(() => useFilteredTags(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(requests.some((r) => r.url.pathname === '/api/v1/capabilities')).toBe(false);
  });
});

describe('useCapabilities', () => {
  it('exposes the raw capability map', async () => {
    const { wrapper } = setup();

    const { result } = renderHook(() => useCapabilities(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toEqual(DEFAULT_CAPABILITIES);
  });
});
