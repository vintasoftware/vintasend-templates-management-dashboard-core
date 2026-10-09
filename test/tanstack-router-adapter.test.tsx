import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type TemplateFiltersState,
  type UseTemplateFiltersOptions,
  useTemplateFilters,
} from '../src/filters/use-template-filters.js';
import { useTanStackRouterAdapter } from '../src/tanstack-router/index.js';

/**
 * Run against a real router rather than a mock: what this adapter exists for
 * is TanStack Router's own URL format, which a mock would only restate.
 */
function setup(search: Record<string, unknown>, options: UseTemplateFiltersOptions = {}) {
  const state: { filters?: TemplateFiltersState } = {};

  function TemplateList() {
    state.filters = useTemplateFilters({ ...options, router: useTanStackRouterAdapter() });
    return null;
  }

  const root = createRootRoute({ component: Outlet });
  const templates = createRoute({
    getParentRoute: () => root,
    path: '/admin/templates',
    component: TemplateList,
  });
  const router = createRouter({
    routeTree: root.addChildren([templates]),
    history: createMemoryHistory({
      initialEntries: [`/admin/templates${defaultStringifySearch(search)}`],
    }),
  });

  render(<RouterProvider router={router} />);

  return {
    router,
    filters: () => {
      if (!state.filters) throw new Error('The route has not rendered yet.');
      return state.filters;
    },
  };
}

describe('useTanStackRouterAdapter', () => {
  it('reads the arrays and quoted strings TanStack Router writes', async () => {
    // `?version=%223%22&status=%5B%22draft%22%2C%22inactive%22%5D` — read raw,
    // `"3"` and `["draft","inactive"]` would both be dropped by the parser.
    const { router, filters } = setup({ version: '3', status: ['draft', 'inactive'] });

    await waitFor(() => expect(filters().filters.version).toBe(3));
    expect(router.state.location.searchStr).toContain('%223%22');
    expect(filters().filters.status).toEqual(['draft', 'inactive']);
  });

  it('reads values TanStack Router parsed as numbers and booleans', async () => {
    const { filters } = setup({ version: 3, mostRecentActiveVersion: false, page: 2 });

    await waitFor(() => expect(filters().filters.version).toBe(3));
    expect(filters().filters.mostRecentActiveVersion).toBe(false);
    expect(filters().page).toBe(2);
  });

  it('writes through the router, keeping the path', async () => {
    const { router, filters } = setup({});
    await waitFor(() => expect(filters()).toBeDefined());

    // Navigation is asynchronous, so each change is read back before the next:
    // a setter computes from the filters of the render it was called in.
    act(() => filters().setFilter('name', 'welcome'));
    await waitFor(() => expect(filters().filters.name).toBe('welcome'));
    act(() => filters().toggleStatus('draft'));
    await waitFor(() => expect(filters().filters.status).toEqual(['draft']));
    act(() => filters().toggleStatus('archived'));

    await waitFor(() => expect(filters().filters.status).toEqual(['draft', 'archived']));
    expect(router.state.location.pathname).toBe('/admin/templates');
    expect(router.state.location.search).toMatchObject({
      name: 'welcome',
      status: ['draft', 'archived'],
    });
  });

  it('leaves the app’s own search parameters as they were, structured ones included', async () => {
    const { router, filters } = setup({ tab: { panel: 'history', open: true }, version: '3' });
    await waitFor(() => expect(filters().filters.version).toBe(3));

    act(() => filters().setFilter('name', 'welcome'));

    await waitFor(() => expect(filters().filters.name).toBe('welcome'));
    expect(router.state.location.search).toMatchObject({
      tab: { panel: 'history', open: true },
      version: '3',
      name: 'welcome',
    });
  });

  it('replaces the history entry by default, and pushes when asked', async () => {
    const replaced = setup({});
    await waitFor(() => expect(replaced.filters()).toBeDefined());
    const before = replaced.router.history.length;

    act(() => replaced.filters().setFilter('name', 'welcome'));
    await waitFor(() => expect(replaced.filters().filters.name).toBe('welcome'));
    expect(replaced.router.history.length).toBe(before);

    const pushed = setup({}, { navigationMode: 'push' });
    await waitFor(() => expect(pushed.filters()).toBeDefined());
    const start = pushed.router.history.length;

    act(() => pushed.filters().setFilter('name', 'welcome'));
    await waitFor(() => expect(pushed.filters().filters.name).toBe('welcome'));
    expect(pushed.router.history.length).toBe(start + 1);
  });

  it('removes a filter that was cleared', async () => {
    const { router, filters } = setup({ name: 'welcome', tab: 'history' });
    await waitFor(() => expect(filters().filters.name).toBe('welcome'));

    act(() => filters().clearFilters());

    await waitFor(() => expect(filters().filters.name).toBeUndefined());
    expect(router.state.location.search).not.toHaveProperty('name');
    expect(router.state.location.search).toMatchObject({ tab: 'history' });
  });
});
