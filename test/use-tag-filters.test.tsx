import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTagFilters } from '../src/filters/use-tag-filters.js';
import { useTemplateFilters } from '../src/filters/use-template-filters.js';

function setUrl(url: string) {
  window.history.replaceState({}, '', url);
}

function render(url = '/tags', options = {}) {
  setUrl(url);

  return renderHook(() => useTagFilters(options));
}

function currentSearch() {
  return new URLSearchParams(window.location.search);
}

describe('useTagFilters', () => {
  beforeEach(() => {
    setUrl('/tags');
  });

  it('starts empty when the URL carries nothing', () => {
    const { result } = render();

    expect(result.current.filters).toEqual({});
    expect(result.current.page).toBe(1);
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('reads filters and pagination out of the URL', () => {
    const { result } = render('/tags?status=active&search=promo&page=2');

    expect(result.current.filters).toEqual({ status: ['active'], search: 'promo' });
    expect(result.current.page).toBe(2);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('exposes a list query with pagination folded in', () => {
    const { result } = render('/tags?search=promo');

    expect(result.current.query).toEqual({ search: 'promo', page: 1, pageSize: 20 });
  });

  it('sets a filter', () => {
    const { result } = render();

    act(() => result.current.setFilter('search', 'promo'));

    expect(currentSearch().get('search')).toBe('promo');
  });

  it('toggles a status on', () => {
    const { result } = render();

    act(() => result.current.toggleStatus('active'));

    expect(result.current.filters.status).toEqual(['active']);
  });

  it('toggles a status off, dropping the filter when it was the last one', () => {
    const { result } = render('/tags?status=active');

    act(() => result.current.toggleStatus('active'));

    expect(currentSearch().has('status')).toBe(false);
  });

  it('clears the filters', () => {
    const { result } = render('/tags?status=active&search=promo');

    act(() => result.current.clearFilters());

    expect(result.current.filters).toEqual({});
  });

  it('returns to defaultFilters when cleared', () => {
    const { result } = render('/tags?search=promo', {
      defaultFilters: { status: ['active'] },
    });

    act(() => result.current.clearFilters());

    expect(result.current.filters).toEqual({ status: ['active'] });
  });

  it('resets to page 1 when a filter changes', () => {
    const { result } = render('/tags?page=5');

    act(() => result.current.setFilter('search', 'promo'));

    expect(result.current.page).toBe(1);
  });

  it('keeps the filters when paging', () => {
    const { result } = render('/tags?search=promo');

    act(() => result.current.setPage(3));

    expect(result.current.page).toBe(3);
    expect(result.current.filters.search).toBe('promo');
  });

  describe('paramPrefix', () => {
    it('reads its filters from prefixed parameters', () => {
      const { result } = render('/tags?tagStatus=active&tagSearch=promo', {
        paramPrefix: 'tag',
      });

      expect(result.current.filters).toEqual({ status: ['active'], search: 'promo' });
    });

    it('ignores the unprefixed parameters, which belong to another list', () => {
      const { result } = render('/tags?status=draft&search=other&tagSearch=promo', {
        paramPrefix: 'tag',
      });

      expect(result.current.filters).toEqual({ search: 'promo' });
    });

    it('reads prefixed pagination', () => {
      const { result } = render('/tags?tagPage=3&tagPageSize=50', { paramPrefix: 'tag' });

      expect(result.current.page).toBe(3);
      expect(result.current.pageSize).toBe(50);
    });

    it('writes prefixed parameters', () => {
      const { result } = render('/tags', { paramPrefix: 'tag' });

      act(() => result.current.setFilter('search', 'promo'));

      expect(currentSearch().get('tagSearch')).toBe('promo');
      expect(currentSearch().has('search')).toBe(false);
    });

    it('writes a prefixed list as repeated parameters', () => {
      const { result } = render('/tags', { paramPrefix: 'tag' });

      act(() => result.current.setFilters({ status: ['active', 'archived'] }));

      expect(currentSearch().getAll('tagStatus')).toEqual(['active', 'archived']);
    });

    it('leaves another list’s unprefixed parameters untouched when it writes', () => {
      const { result } = render('/tags?status=draft&name=Welcome', { paramPrefix: 'tag' });

      act(() => result.current.setFilter('search', 'promo'));

      expect(currentSearch().get('status')).toBe('draft');
      expect(currentSearch().get('name')).toBe('Welcome');
      expect(currentSearch().get('tagSearch')).toBe('promo');
    });

    it('clears only its own parameters', () => {
      const { result } = render('/tags?status=draft&tagSearch=promo&tagStatus=active', {
        paramPrefix: 'tag',
      });

      act(() => result.current.clearFilters());

      expect(currentSearch().has('tagSearch')).toBe(false);
      expect(currentSearch().has('tagStatus')).toBe(false);
      expect(currentSearch().get('status')).toBe('draft');
    });
  });

  describe('sharing a URL with the template list', () => {
    it('keeps the two status filters apart when one is prefixed', () => {
      setUrl('/dashboard');

      const { result } = renderHook(() => ({
        templates: useTemplateFilters(),
        tags: useTagFilters({ paramPrefix: 'tag' }),
      }));

      act(() => result.current.templates.toggleStatus('draft'));
      act(() => result.current.tags.toggleStatus('archived'));

      expect(currentSearch().getAll('status')).toEqual(['draft']);
      expect(currentSearch().getAll('tagStatus')).toEqual(['archived']);
      expect(result.current.templates.filters.status).toEqual(['draft']);
      expect(result.current.tags.filters.status).toEqual(['archived']);
    });

    it('does not clobber the template filters when the tag list writes', () => {
      setUrl('/dashboard?name=Welcome&status=draft');

      const { result } = renderHook(() => ({
        templates: useTemplateFilters(),
        tags: useTagFilters({ paramPrefix: 'tag' }),
      }));

      act(() => result.current.tags.setFilter('search', 'promo'));

      expect(result.current.templates.filters).toEqual({ name: 'Welcome', status: ['draft'] });
    });
  });
});
