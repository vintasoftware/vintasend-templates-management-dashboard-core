import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createStaticRouterAdapter } from '../src/filters/router.js';
import { useTemplateFilters } from '../src/filters/use-template-filters.js';

function setUrl(url: string) {
  window.history.replaceState({}, '', url);
}

function render(url = '/templates', options = {}) {
  setUrl(url);

  return renderHook(() => useTemplateFilters(options));
}

function currentSearch() {
  return new URLSearchParams(window.location.search);
}

describe('useTemplateFilters', () => {
  beforeEach(() => {
    setUrl('/templates');
  });

  describe('reading', () => {
    it('starts empty when the URL carries nothing', () => {
      const { result } = render();

      expect(result.current.filters).toEqual({});
      expect(result.current.page).toBe(1);
      expect(result.current.pageSize).toBe(20);
      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('reads filters and pagination out of the URL', () => {
      const { result } = render('/templates?name=Welcome&status=draft&page=3&pageSize=50');

      expect(result.current.filters).toEqual({ name: 'Welcome', status: ['draft'] });
      expect(result.current.page).toBe(3);
      expect(result.current.pageSize).toBe(50);
      expect(result.current.hasActiveFilters).toBe(true);
    });

    it('exposes a list query with pagination folded in', () => {
      const { result } = render('/templates?status=active&page=2');

      expect(result.current.query).toEqual({ status: ['active'], page: 2, pageSize: 20 });
    });

    it('ignores an invalid filter in the URL', () => {
      const { result } = render('/templates?status=bogus');

      expect(result.current.filters).toEqual({});
    });
  });

  describe('defaults', () => {
    it('applies defaultFilters when the URL is silent', () => {
      const { result } = render('/templates', {
        defaultFilters: { templateManagedBackend: 'db' },
      });

      expect(result.current.filters).toEqual({ templateManagedBackend: 'db' });
    });

    it('lets the URL override a default', () => {
      const { result } = render('/templates?templateManagedBackend=other', {
        defaultFilters: { templateManagedBackend: 'db' },
      });

      expect(result.current.filters.templateManagedBackend).toBe('other');
    });

    it('clamps an out-of-range defaultPageSize', () => {
      const { result } = render('/templates', { defaultPageSize: 1000 });

      expect(result.current.pageSize).toBe(100);
    });
  });

  describe('setFilters', () => {
    it('writes the filters to the URL', () => {
      const { result } = render();

      act(() => result.current.setFilters({ name: 'Welcome' }));

      expect(currentSearch().get('name')).toBe('Welcome');
      expect(result.current.filters).toEqual({ name: 'Welcome' });
    });

    it('accepts an updater function', () => {
      const { result } = render('/templates?name=Welcome');

      act(() => result.current.setFilters((previous) => ({ ...previous, key: 'welcome' })));

      expect(result.current.filters).toEqual({ name: 'Welcome', key: 'welcome' });
    });

    it('replaces rather than merges', () => {
      const { result } = render('/templates?name=Welcome&key=welcome');

      act(() => result.current.setFilters({ name: 'Other' }));

      expect(result.current.filters).toEqual({ name: 'Other' });
      expect(currentSearch().has('key')).toBe(false);
    });

    it('resets to page 1, since the old page number no longer means anything', () => {
      const { result } = render('/templates?page=5');

      act(() => result.current.setFilters({ name: 'Welcome' }));

      expect(result.current.page).toBe(1);
    });

    it('leaves unrelated URL parameters alone', () => {
      const { result } = render('/templates?tab=drafts');

      act(() => result.current.setFilters({ name: 'Welcome' }));

      expect(currentSearch().get('tab')).toBe('drafts');
    });

    it('writes a list filter as repeated parameters', () => {
      const { result } = render();

      act(() => result.current.setFilters({ status: ['draft', 'active'] }));

      expect(currentSearch().getAll('status')).toEqual(['draft', 'active']);
    });
  });

  describe('patchFilters and setFilter', () => {
    it('merges a patch into the current filters', () => {
      const { result } = render('/templates?name=Welcome');

      act(() => result.current.patchFilters({ key: 'welcome' }));

      expect(result.current.filters).toEqual({ name: 'Welcome', key: 'welcome' });
    });

    it('clears a key set to undefined in a patch', () => {
      const { result } = render('/templates?name=Welcome&key=welcome');

      act(() => result.current.patchFilters({ key: undefined }));

      expect(result.current.filters).toEqual({ name: 'Welcome' });
    });

    it('sets a single filter', () => {
      const { result } = render();

      act(() => result.current.setFilter('isAbstract', true));

      expect(result.current.filters).toEqual({ isAbstract: true });
    });

    it('keeps a false boolean rather than treating it as unset', () => {
      const { result } = render();

      act(() => result.current.setFilter('mostRecentActiveVersion', false));

      expect(result.current.filters.mostRecentActiveVersion).toBe(false);
      expect(currentSearch().get('mostRecentActiveVersion')).toBe('false');
    });

    it('clears a single filter set to an empty string, as a text input would', () => {
      const { result } = render('/templates?name=Welcome');

      act(() => result.current.setFilter('name', ''));

      expect(result.current.filters).toEqual({});
      expect(currentSearch().has('name')).toBe(false);
    });

    it('clears a list filter set to an empty array', () => {
      const { result } = render('/templates?status=draft');

      act(() => result.current.setFilter('status', []));

      expect(result.current.filters).toEqual({});
      expect(currentSearch().has('status')).toBe(false);
    });
  });

  describe('toggleStatus', () => {
    it('adds a status when it is absent', () => {
      const { result } = render();

      act(() => result.current.toggleStatus('draft'));

      expect(result.current.filters.status).toEqual(['draft']);
    });

    it('appends to an existing selection', () => {
      const { result } = render('/templates?status=draft');

      act(() => result.current.toggleStatus('active'));

      expect(result.current.filters.status).toEqual(['draft', 'active']);
    });

    it('removes a status that is already selected', () => {
      const { result } = render('/templates?status=draft&status=active');

      act(() => result.current.toggleStatus('draft'));

      expect(result.current.filters.status).toEqual(['active']);
    });

    it('drops the filter entirely when the last status is removed', () => {
      const { result } = render('/templates?status=draft');

      act(() => result.current.toggleStatus('draft'));

      expect(result.current.filters.status).toBeUndefined();
      expect(currentSearch().has('status')).toBe(false);
    });

    it('resets to page 1', () => {
      const { result } = render('/templates?page=4');

      act(() => result.current.toggleStatus('draft'));

      expect(result.current.page).toBe(1);
    });
  });

  describe('toggleTag', () => {
    it('adds to includesAllTags by default', () => {
      const { result } = render();

      act(() => result.current.toggleTag('marketing'));

      expect(result.current.filters.includesAllTags).toEqual(['marketing']);
    });

    it('adds to includesAnyOfTags in any mode', () => {
      const { result } = render();

      act(() => result.current.toggleTag('marketing', 'any'));

      expect(result.current.filters.includesAnyOfTags).toEqual(['marketing']);
      expect(result.current.filters.includesAllTags).toBeUndefined();
    });

    it('removes a tag that is already selected', () => {
      const { result } = render('/templates?includesAllTags=a&includesAllTags=b');

      act(() => result.current.toggleTag('a'));

      expect(result.current.filters.includesAllTags).toEqual(['b']);
    });

    it('drops the filter when the last tag is removed, since an empty list is a 400', () => {
      const { result } = render('/templates?includesAllTags=a');

      act(() => result.current.toggleTag('a'));

      expect(currentSearch().has('includesAllTags')).toBe(false);
    });

    it('keeps the two tag modes independent', () => {
      const { result } = render('/templates?includesAllTags=a');

      act(() => result.current.toggleTag('b', 'any'));

      expect(result.current.filters.includesAllTags).toEqual(['a']);
      expect(result.current.filters.includesAnyOfTags).toEqual(['b']);
    });
  });

  describe('clearFilters', () => {
    it('removes every filter', () => {
      const { result } = render('/templates?name=Welcome&status=draft&includesAllTags=a');

      act(() => result.current.clearFilters());

      expect(result.current.filters).toEqual({});
      expect(result.current.hasActiveFilters).toBe(false);
    });

    it('keeps the chosen ordering, which is a view preference rather than a filter', () => {
      const { result } = render('/templates?name=Welcome&orderByField=name&orderByDirection=asc');

      act(() => result.current.clearFilters());

      expect(result.current.filters).toEqual({ orderByField: 'name', orderByDirection: 'asc' });
    });

    it('returns to defaultFilters rather than to nothing', () => {
      const { result } = render('/templates?name=Welcome', {
        defaultFilters: { templateManagedBackend: 'db' },
      });

      act(() => result.current.clearFilters());

      expect(result.current.filters).toEqual({ templateManagedBackend: 'db' });
    });

    it('goes back to page 1', () => {
      const { result } = render('/templates?name=Welcome&page=4');

      act(() => result.current.clearFilters());

      expect(result.current.page).toBe(1);
    });
  });

  describe('pagination', () => {
    it('sets the page', () => {
      const { result } = render('/templates?name=Welcome');

      act(() => result.current.setPage(3));

      expect(result.current.page).toBe(3);
    });

    it('keeps the filters when paging', () => {
      const { result } = render('/templates?status=draft&status=active');

      act(() => result.current.setPage(2));

      expect(result.current.filters.status).toEqual(['draft', 'active']);
    });

    it('floors a page below 1 up to 1', () => {
      const { result } = render();

      act(() => result.current.setPage(0));

      expect(result.current.page).toBe(1);
    });

    it('returns to page 1 when the page size changes', () => {
      const { result } = render('/templates?page=4');

      act(() => result.current.setPageSize(50));

      expect(result.current.page).toBe(1);
      expect(result.current.pageSize).toBe(50);
    });

    it('clamps the page size to the contract maximum', () => {
      const { result } = render();

      act(() => result.current.setPageSize(9000));

      expect(result.current.pageSize).toBe(100);
    });
  });

  describe('setSort', () => {
    it('sets a field and direction', () => {
      const { result } = render();

      act(() => result.current.setSort('name', 'desc'));

      expect(result.current.filters.orderByField).toBe('name');
      expect(result.current.filters.orderByDirection).toBe('desc');
    });

    it('defaults to ascending', () => {
      const { result } = render();

      act(() => result.current.setSort('key'));

      expect(result.current.filters.orderByDirection).toBe('asc');
    });

    it('clears both keys together, since a lone direction is a 400', () => {
      const { result } = render('/templates?orderByField=name&orderByDirection=asc');

      act(() => result.current.setSort());

      expect(currentSearch().has('orderByField')).toBe(false);
      expect(currentSearch().has('orderByDirection')).toBe(false);
    });

    it('keeps the filters when sorting', () => {
      const { result } = render('/templates?status=draft');

      act(() => result.current.setSort('name'));

      expect(result.current.filters.status).toEqual(['draft']);
    });

    it('goes back to page 1', () => {
      const { result } = render('/templates?page=3');

      act(() => result.current.setSort('name'));

      expect(result.current.page).toBe(1);
    });
  });

  describe('with a supplied router', () => {
    it('reads from the supplied adapter rather than the URL', () => {
      setUrl('/templates?name=FromUrl');

      const { result } = renderHook(() =>
        useTemplateFilters({ router: createStaticRouterAdapter('name=FromAdapter') }),
      );

      expect(result.current.filters).toEqual({ name: 'FromAdapter' });
    });

    it('writes through the supplied adapter', () => {
      const writes: string[] = [];
      const adapter = {
        searchParams: new URLSearchParams('name=Welcome'),
        setSearchParams: (next: URLSearchParams) => writes.push(next.toString()),
      };

      const { result } = renderHook(() => useTemplateFilters({ router: adapter }));

      act(() => result.current.setFilter('key', 'welcome'));

      expect(writes).toHaveLength(1);
      expect(new URLSearchParams(writes[0]).get('key')).toBe('welcome');
      expect(window.location.search).toBe('');
    });

    it('asks the adapter to replace by default', () => {
      const modes: (boolean | undefined)[] = [];
      const adapter = {
        searchParams: new URLSearchParams(),
        setSearchParams: (_next: URLSearchParams, options?: { replace?: boolean }) =>
          modes.push(options?.replace),
      };

      const { result } = renderHook(() => useTemplateFilters({ router: adapter }));

      act(() => result.current.setFilter('name', 'Welcome'));

      expect(modes).toEqual([true]);
    });

    it('asks the adapter to push when navigationMode is push', () => {
      const modes: (boolean | undefined)[] = [];
      const adapter = {
        searchParams: new URLSearchParams(),
        setSearchParams: (_next: URLSearchParams, options?: { replace?: boolean }) =>
          modes.push(options?.replace),
      };

      const { result } = renderHook(() =>
        useTemplateFilters({ router: adapter, navigationMode: 'push' }),
      );

      act(() => result.current.setFilter('name', 'Welcome'));

      expect(modes).toEqual([false]);
    });
  });
});
