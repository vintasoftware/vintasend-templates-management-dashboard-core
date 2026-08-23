import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createTemplatesClient } from '../src/api/query.js';
import * as mutations from '../src/hooks/mutations.js';
import { useTagsQuery, useTemplatesQuery } from '../src/hooks/queries.js';
import { TemplatesProvider } from '../src/provider.js';

/**
 * Every mutation hook is a one-line wrapper over the generated client except
 * for one decision: which caches it invalidates. Getting that wrong is a real
 * bug — a template whose status changed still rendering as draft, or a renamed
 * tag still showing its old text on the rows carrying it — and it is invisible
 * until someone clicks.
 *
 * So this walks every write endpoint and asserts what each one refreshes.
 * `usePreviewTemplate` is in the table too, precisely because it must refresh
 * nothing.
 */

type Variables = Record<string, unknown>;

/**
 * The hooks are precisely typed and their variable shapes all differ, so the
 * table holds them opaquely and each case is narrowed back at the call site.
 */
type AnyMutation = { mutateAsync: (variables: Variables) => Promise<unknown> };

type Case = {
  name: string;
  hook: () => unknown;
  variables: Variables;
  /** Whether the template list should be refetched afterwards. */
  templates: boolean;
  /** Whether the tag list should be refetched afterwards. */
  tags: boolean;
};

const KEY = { params: { path: { key: 'welcome' } } };
const SLUG = { params: { path: { slug: 'marketing' } } };

const CASES: Case[] = [
  {
    name: 'useCreateTemplate',
    hook: mutations.useCreateTemplate,
    variables: { body: { key: 'new', name: 'New', bodyTemplate: '<p/>' } },
    templates: true,
    tags: false,
  },
  {
    name: 'useCreateTemplateVersion',
    hook: mutations.useCreateTemplateVersion,
    variables: { ...KEY, body: { bodyTemplate: '<p/>' } },
    templates: true,
    tags: false,
  },
  {
    name: 'useDeleteTemplate',
    hook: mutations.useDeleteTemplate,
    variables: KEY,
    templates: true,
    tags: false,
  },
  {
    name: 'useDeleteTemplateVersion',
    hook: mutations.useDeleteTemplateVersion,
    variables: { params: { path: { key: 'welcome', version: 1 } } },
    templates: true,
    tags: false,
  },
  {
    name: 'useSetTemplateStatus',
    hook: mutations.useSetTemplateStatus,
    variables: { ...KEY, body: { status: 'active' } },
    templates: true,
    tags: false,
  },
  {
    name: 'useActivateTemplate',
    hook: mutations.useActivateTemplate,
    variables: { ...KEY, body: {} },
    templates: true,
    tags: false,
  },
  {
    name: 'useDeactivateTemplate',
    hook: mutations.useDeactivateTemplate,
    variables: { ...KEY, body: {} },
    templates: true,
    tags: false,
  },
  {
    name: 'useArchiveTemplate',
    hook: mutations.useArchiveTemplate,
    variables: { ...KEY, body: {} },
    templates: true,
    tags: false,
  },
  {
    name: 'useSetTemplateTags',
    hook: mutations.useSetTemplateTags,
    variables: { ...KEY, body: { tags: ['marketing'] } },
    templates: true,
    tags: false,
  },
  // A tag write reaches the template rows too: templates carry their tags inline.
  {
    name: 'useCreateTag',
    hook: mutations.useCreateTag,
    variables: { body: { text: 'Marketing' } },
    templates: true,
    tags: true,
  },
  {
    name: 'useUpdateTag',
    hook: mutations.useUpdateTag,
    variables: { ...SLUG, body: { text: 'Renamed' } },
    templates: true,
    tags: true,
  },
  {
    name: 'useDeleteTag',
    hook: mutations.useDeleteTag,
    variables: SLUG,
    templates: true,
    tags: true,
  },
  {
    name: 'useArchiveTag',
    hook: mutations.useArchiveTag,
    variables: { ...SLUG, body: {} },
    templates: true,
    tags: true,
  },
  {
    name: 'useRestoreTag',
    hook: mutations.useRestoreTag,
    variables: { ...SLUG, body: {} },
    templates: true,
    tags: true,
  },
  // A preview renders; it changes nothing, so it must invalidate nothing.
  {
    name: 'usePreviewTemplate',
    hook: mutations.usePreviewTemplate,
    variables: { ...KEY, body: { context: {} } },
    templates: false,
    tags: false,
  },
];

/** Answers anything with an empty-but-valid envelope, and counts the GETs. */
function setup() {
  const gets: string[] = [];

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const { pathname } = new URL(request.url);

    if (request.method === 'GET') {
      gets.push(pathname);

      const body =
        pathname === '/api/v1/templates' || pathname === '/api/v1/tags'
          ? { data: [], page: 1, pageSize: 20, hasMore: false }
          : { data: {} };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ data: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const client = createTemplatesClient({
    baseUrl: 'https://api.example.com',
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
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

  return { gets, wrapper, count: (path: string) => gets.filter((p) => p === path).length };
}

describe.each(CASES)('$name', ({ hook, variables, templates, tags }) => {
  it(`${templates ? 'refreshes' : 'leaves'} the template list${templates ? '' : ' alone'}`, async () => {
    const { wrapper, count } = setup();

    const { result } = renderHook(
      () => ({ list: useTemplatesQuery({ page: 1, pageSize: 20 }), mutation: hook() }),
      { wrapper },
    );

    await waitFor(() => expect(count('/api/v1/templates')).toBe(1));

    await act(async () => {
      await (result.current.mutation as AnyMutation).mutateAsync(variables);
    });

    if (templates) {
      await waitFor(() => expect(count('/api/v1/templates')).toBeGreaterThan(1));
    } else {
      expect(count('/api/v1/templates')).toBe(1);
    }
  });

  it(`${tags ? 'refreshes' : 'leaves'} the tag list${tags ? '' : ' alone'}`, async () => {
    const { wrapper, count } = setup();

    const { result } = renderHook(
      () => ({ list: useTagsQuery({ page: 1, pageSize: 20 }), mutation: hook() }),
      { wrapper },
    );

    await waitFor(() => expect(count('/api/v1/tags')).toBe(1));

    await act(async () => {
      await (result.current.mutation as AnyMutation).mutateAsync(variables);
    });

    if (tags) {
      await waitFor(() => expect(count('/api/v1/tags')).toBeGreaterThan(1));
    } else {
      expect(count('/api/v1/tags')).toBe(1);
    }
  });
});
