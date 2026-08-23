# vintasend-templates-management-dashboard-core

The non-visual half of a VintaSend **template-management** dashboard: a typed
API client generated from the OpenAPI contract, TanStack Query hooks over it,
and template and tag filters that live in the URL.

No components, no opinion about authentication. It is the sibling of
[`vintasend-dashboard-core`](https://github.com/vintasoftware/vintasend-dashboard-core),
which does the same job for the notifications API.

```
openapi.yaml  ──(openapi-typescript)──▶  src/api/schema.ts
                                              │
                          openapi-fetch  ◀────┤
                                 │            │
                     openapi-react-query  ◀───┘
                                 │
              useTemplateFilters / useTagFilters (URL state)
                                 │
                useFilteredTemplates / useFilteredTags
```

## Install

```bash
npm install vintasend-templates-management-dashboard-core @tanstack/react-query
```

`react` (18 or 19) and `@tanstack/react-query` v5 are peer dependencies. `next`
is an optional peer, needed only for the `/next` entry point.

## Setup

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  TemplatesProvider,
  createTemplatesClient,
} from 'vintasend-templates-management-dashboard-core';

const queryClient = new QueryClient();

// Points at your own route, which forwards to the API with the secret key.
const templates = createTemplatesClient({ baseUrl: '/api/templates' });

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TemplatesProvider client={templates}>{children}</TemplatesProvider>
    </QueryClientProvider>
  );
}
```

### A note on the API key

The API authenticates with a bearer key that is a **server-side secret**. Do not
put it in `createTemplatesClient` in browser code. Three shapes work:

```ts
// 1. Browser -> your server -> the API. Your route adds the key.
createTemplatesClient({ baseUrl: '/api/templates' });

// 2. Browser -> the API, authenticated with your app's own session.
createTemplatesClient({
  baseUrl: 'https://templates.example.com',
  getHeaders: async () => ({ Authorization: `Bearer ${await getAccessToken()}` }),
});

// 3. Server-side only (route handler, server component, CLI).
createTemplatesClient({
  baseUrl: process.env.TEMPLATES_API_URL!,
  apiKey: process.env.TEMPLATES_API_KEY!,
});
```

`getHeaders` is resolved before every request, so a rotating token works without
rebuilding the client.

## Two things this contract does differently

If you already know `vintasend-dashboard-core`, these are the differences that
will bite:

**1. Templates are versioned, not edited.** A row in the store is a *version*.
`GET /templates` collapses to one row per key by default
(`mostRecentActiveVersion=true`); send `false` for the raw listing with every
version included. There is no "update template" mutation — `useCreateTemplateVersion`
is the edit, and any field you omit is carried forward from the latest version.

**2. Ordering is gated, filtering is not.** The capability namespaces have
**opposite defaults**:

| Namespace | Missing key means | Unsupported request |
| --- | --- | --- |
| `fields.*`, `stringLookups.*`, `logical.*` | supported | silently dropped, you get more rows |
| `orderBy.*` | **not** supported | **400** |

So a sortable column must be gated on capabilities, or the first click is an
error. `useFilteredTemplates` resolves this for you:

```tsx
const { sortableFields, canSortBy, setSort } = useFilteredTemplates();

{canSortBy('name') && <SortButton onClick={() => setSort('name', 'asc')} />}
```

Outside that hook, use `supportsOrdering` / `supportsFilter` — never one shared
helper, since they default in opposite directions.

## Filters in the URL

`useTemplateFilters` keeps the whole filter state in the query string. There is
no local copy to drift out of sync, so a filtered view is shareable, survives a
reload, and the back button steps through it.

```tsx
const {
  filters, page, pageSize, query,
  setFilter, patchFilters, setFilters, clearFilters,
  toggleStatus, toggleTag,
  setPage, setPageSize, setSort,
  hasActiveFilters,
} = useTemplateFilters();
```

Values that are not legal — `?status=nope`, `?version=0`, `?page=0`, a
`pageSize` over the contract's maximum — are dropped or clamped rather than
forwarded. Changing a filter, the sort, or the page size resets to page 1.

### List filters

`status`, `includesAllTags` and `includesAnyOfTags` are repeated parameters
(`?status=draft&status=active`). `toggleStatus` and `toggleTag` add and remove
members, and drop the parameter entirely when the last one goes — an empty list
is a 400 here, not "match nothing". Tag lists also accept a comma-separated
form, so `?includesAllTags=a,b` works, and are truncated to the 50 the server
accepts.

### Booleans

`mostRecentActiveVersion` and `isAbstract` round-trip through text properly:
`?isAbstract=false` means false, not "the string 'false' is truthy". A key
absent from the URL comes back `undefined`, meaning "let the server apply its
default" — `hasActiveFilters` knows that the default one-row-per-key view is not
a filter the user chose.

### Binding it to your router

The hooks read and write through a small adapter, so they never import a router.

| Setup | Adapter |
| --- | --- |
| Next.js app router | `useNextRouterAdapter()` from `…/next` |
| Anything else | the default — `useHistoryRouterAdapter()` |
| Server render, tests | `createStaticRouterAdapter(search)` |

```tsx
'use client';

import { useFilteredTemplates } from 'vintasend-templates-management-dashboard-core';
import { useNextRouterAdapter } from 'vintasend-templates-management-dashboard-core/next';

export function TemplateList() {
  const router = useNextRouterAdapter();
  const { templates, filters, toggleStatus } = useFilteredTemplates({ router });
}
```

Use the Next adapter in a Next app: navigating through the router is what lets a
server component re-render with the new filters. As with anything that reads
search params in Next, the component must be a client component under a
`<Suspense>` boundary.

To write your own — react-router, TanStack Router, a custom scheme — implement
two members:

```ts
type RouterAdapter = {
  searchParams: URLSearchParams;
  setSearchParams: (next: URLSearchParams, options?: { replace?: boolean }) => void;
};
```

### Showing templates and tags on one screen

Both lists have a `status` filter, so they collide in one query string. Give the
tag list a prefix:

```tsx
const templates = useFilteredTemplates({ router });
const tags = useFilteredTags({ router, paramPrefix: 'tag' });
// ?status=draft&tagStatus=active&tagPage=2
```

## Filters + data, together

```tsx
export function TemplateTable() {
  const {
    templates, isLoading, error,
    filters, toggleStatus, clearFilters, hasActiveFilters,
    page, hasNextPage, hasPreviousPage, nextPage, previousPage,
    sortableFields, canSortBy, setSort,
  } = useFilteredTemplates({ router: useNextRouterAdapter() });

  if (error) return <Error message={getApiErrorMessage(error)} />;

  return (
    <>
      {TEMPLATE_STATUSES.map((status) => (
        <Chip
          key={status}
          active={filters.status?.includes(status)}
          onClick={() => toggleStatus(status)}
        />
      ))}
      {hasActiveFilters && <button onClick={clearFilters}>Clear</button>}

      <table>{templates.map((t) => <Row key={t.id} template={t} />)}</table>

      <button disabled={!hasPreviousPage} onClick={previousPage}>Previous</button>
      <span>Page {page}</span>
      <button disabled={!hasNextPage} onClick={nextPage}>Next</button>
    </>
  );
}
```

The API reports `hasMore` rather than a total count — a backend is not required
to be able to count — so there is a "next page" flag but no page count.

Debouncing a text filter is left to you; `setFilter` writes immediately.

## Hooks

### Reads

| Hook | Endpoint |
| --- | --- |
| `useTemplatesQuery(query)` | `GET /api/v1/templates` |
| `useTemplate(key, version?)` | `GET /api/v1/templates/{key}` |
| `useTemplateVersions(key)` | `GET /api/v1/templates/{key}/versions` |
| `useTemplateVersion(key, version)` | `GET /api/v1/templates/{key}/versions/{version}` |
| `useTemplateComposition(key, version?)` | `GET /api/v1/templates/{key}/composition` |
| `useTemplateStatusHistory(key, version?)` | `GET /api/v1/templates/{key}/status-history` |
| `useTagsQuery(query)` | `GET /api/v1/tags` |
| `useTag(slug)` | `GET /api/v1/tags/{slug}` |
| `useCapabilities()` | `GET /api/v1/capabilities` |
| `useHealth()` | `GET /health` |

Every id-taking hook stays idle while its key is `null`, which is what a detail
panel that is not open yet wants.

On `version`: omitting it means **the latest** everywhere except
`useTemplateStatusHistory`, where it means **every version**. That asymmetry is
the contract's, not this package's.

### Writes

| Hook | Endpoint |
| --- | --- |
| `useCreateTemplate()` | `POST /api/v1/templates` |
| `useCreateTemplateVersion()` | `POST /api/v1/templates/{key}/versions` |
| `useDeleteTemplate()` | `DELETE /api/v1/templates/{key}` |
| `useDeleteTemplateVersion()` | `DELETE /api/v1/templates/{key}/versions/{version}` |
| `useSetTemplateStatus()` | `POST /api/v1/templates/{key}/status` |
| `useActivateTemplate()` | `POST /api/v1/templates/{key}/activate` |
| `useDeactivateTemplate()` | `POST /api/v1/templates/{key}/deactivate` |
| `useArchiveTemplate()` | `POST /api/v1/templates/{key}/archive` |
| `usePreviewTemplate()` | `POST /api/v1/templates/{key}/preview` |
| `useSetTemplateTags()` | `PUT /api/v1/templates/{key}/tags` |
| `useCreateTag()` | `POST /api/v1/tags` |
| `useUpdateTag()` | `PATCH /api/v1/tags/{slug}` |
| `useDeleteTag()` | `DELETE /api/v1/tags/{slug}` |
| `useArchiveTag()` | `POST /api/v1/tags/{slug}/archive` |
| `useRestoreTag()` | `POST /api/v1/tags/{slug}/restore` |

Variables keep the generated shape, and every write invalidates the caches it
affects:

```tsx
const archive = useArchiveTemplate();
archive.mutate({ params: { path: { key } }, body: {} });

const setTags = useSetTemplateTags();
setTags.mutate({ params: { path: { key } }, body: { tags: ['marketing'] } });
```

`usePreviewTemplate` is a POST but changes nothing, so it deliberately
invalidates nothing — drive a live preview pane from it on a debounce.

Renaming or archiving a tag invalidates the **template** queries too, since
templates carry their tags inline.

Anything not named above is still reachable, fully typed, through the raw
generated client:

```tsx
const api = useTemplatesApi();
const { data } = api.useQuery('get', '/api/v1/templates/{key}', {
  params: { path: { key } },
});
```

## Status lifecycle

A move the lifecycle does not allow answers `INVALID_STATUS_TRANSITION`. Every
template reports its legal next steps, so offer only those:

```tsx
{template.allowedTransitions.map((status) => (
  <button key={status} onClick={() => setStatus.mutate({
    params: { path: { key: template.key } },
    body: { status },
  })}>
    {status}
  </button>
))}
```

## Errors

A failed query rejects with the contract's error envelope, so branch on the code
rather than on message text:

```tsx
switch (getApiErrorCode(error)) {
  case 'INVALID_STATUS_TRANSITION': return <TransitionRefused />;
  case 'TEMPLATE_COMPOSITION_ERROR': return <BrokenInheritance />;
  case 'PREVIEW_UNAVAILABLE': return <NoPreview />;
  default: return <p>{getApiErrorMessage(error)}</p>;
}
```

`getApiErrorMessage` also handles network failures. `isApiErrorResponse` narrows
the type, `getApiErrorDetails` reads the machine-readable context, and
`toApiErrorResponse` coerces any rejection into the same envelope.

## Regenerating the client

`src/api/schema.ts` is generated by
[`openapi-typescript`](https://openapi-ts.dev) from the API package's
`openapi.yaml`, and committed so the package builds on its own. Never edit it by
hand:

```bash
npm run generate:api
```

CI regenerates it against the published contract and fails if the committed copy
is stale.

## Development

```bash
npm install
npm run generate:api   # from ../vintasend-templates-management-api/openapi.yaml
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
```

## Releasing

Tag `v<version>` matching `package.json`, and the publish workflow ships it to
npm over OIDC trusted publishing — no `NPM_TOKEN`. A prerelease version goes out
under its own dist-tag (`1.0.0-alpha1` → `alpha`).

## License

MIT
