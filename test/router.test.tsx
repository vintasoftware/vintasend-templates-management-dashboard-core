import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createStaticRouterAdapter, useHistoryRouterAdapter } from '../src/filters/router.js';

function setUrl(url: string) {
  window.history.replaceState({}, '', url);
}

describe('useHistoryRouterAdapter', () => {
  beforeEach(() => {
    setUrl('/templates');
  });

  it('reads the current query string', () => {
    setUrl('/templates?status=draft&page=2');

    const { result } = renderHook(() => useHistoryRouterAdapter());

    expect(result.current.searchParams.get('status')).toBe('draft');
    expect(result.current.searchParams.get('page')).toBe('2');
  });

  it('writes params to the URL and re-renders with them', () => {
    const { result } = renderHook(() => useHistoryRouterAdapter());

    act(() => {
      result.current.setSearchParams(new URLSearchParams({ status: 'active' }));
    });

    expect(window.location.search).toBe('?status=active');
    expect(result.current.searchParams.get('status')).toBe('active');
  });

  it('replaces the history entry by default', () => {
    setUrl('/templates?status=draft');
    const lengthBefore = window.history.length;

    const { result } = renderHook(() => useHistoryRouterAdapter());

    act(() => {
      result.current.setSearchParams(new URLSearchParams({ status: 'archived' }));
    });

    expect(window.history.length).toBe(lengthBefore);
  });

  it('pushes a history entry when asked to', () => {
    const lengthBefore = window.history.length;

    const { result } = renderHook(() => useHistoryRouterAdapter());

    act(() => {
      result.current.setSearchParams(new URLSearchParams({ status: 'archived' }), {
        replace: false,
      });
    });

    expect(window.history.length).toBe(lengthBefore + 1);
  });

  it('keeps the pathname', () => {
    setUrl('/admin/templates');

    const { result } = renderHook(() => useHistoryRouterAdapter());

    act(() => {
      result.current.setSearchParams(new URLSearchParams({ status: 'draft' }));
    });

    expect(window.location.pathname).toBe('/admin/templates');
  });

  it('drops the question mark when every parameter is cleared', () => {
    setUrl('/templates?status=draft');

    const { result } = renderHook(() => useHistoryRouterAdapter());

    act(() => {
      result.current.setSearchParams(new URLSearchParams());
    });

    expect(window.location.search).toBe('');
    expect(window.location.href.endsWith('/templates')).toBe(true);
  });

  it('picks up a back-button navigation', () => {
    const { result } = renderHook(() => useHistoryRouterAdapter());

    act(() => {
      setUrl('/templates?status=inactive');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.searchParams.get('status')).toBe('inactive');
  });

  it('keeps a stable searchParams identity across renders that change nothing', () => {
    const { result, rerender } = renderHook(() => useHistoryRouterAdapter());

    const first = result.current.searchParams;
    rerender();

    expect(result.current.searchParams).toBe(first);
  });

  it('stops listening once unmounted', () => {
    const { result, unmount } = renderHook(() => useHistoryRouterAdapter());

    const before = result.current.searchParams.toString();
    unmount();

    act(() => {
      setUrl('/templates?status=active');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(result.current.searchParams.toString()).toBe(before);
  });
});

describe('createStaticRouterAdapter', () => {
  it('exposes the query string it was built with', () => {
    expect(createStaticRouterAdapter('status=draft').searchParams.get('status')).toBe('draft');
  });

  it('accepts a URLSearchParams', () => {
    const params = new URLSearchParams('tenant=acme');

    expect(createStaticRouterAdapter(params).searchParams).toBe(params);
  });

  it('discards writes instead of throwing', () => {
    const adapter = createStaticRouterAdapter('status=draft');

    expect(() => adapter.setSearchParams(new URLSearchParams('status=archived'))).not.toThrow();
    expect(adapter.searchParams.get('status')).toBe('draft');
  });
});
