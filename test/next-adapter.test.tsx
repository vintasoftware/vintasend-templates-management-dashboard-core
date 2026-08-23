import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
const push = vi.fn();
const state = { pathname: '/templates', search: '' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(state.search),
}));

const { useNextRouterAdapter } = await import('../src/next/index.js');

describe('useNextRouterAdapter', () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    state.pathname = '/templates';
    state.search = '';
  });

  it('exposes the router search params', () => {
    state.search = 'status=draft&page=2';

    const { result } = renderHook(() => useNextRouterAdapter());

    expect(result.current.searchParams.get('status')).toBe('draft');
    expect(result.current.searchParams.get('page')).toBe('2');
  });

  it('hands out a mutable copy, not Next’s readonly params', () => {
    state.search = 'status=draft';

    const { result } = renderHook(() => useNextRouterAdapter());

    expect(() => result.current.searchParams.set('status', 'archived')).not.toThrow();
    expect(result.current.searchParams.get('status')).toBe('archived');
  });

  it('replaces through the Next router by default', () => {
    const { result } = renderHook(() => useNextRouterAdapter());

    result.current.setSearchParams(new URLSearchParams({ status: 'active' }));

    expect(replace).toHaveBeenCalledWith('/templates?status=active', { scroll: false });
    expect(push).not.toHaveBeenCalled();
  });

  it('pushes when asked to', () => {
    const { result } = renderHook(() => useNextRouterAdapter());

    result.current.setSearchParams(new URLSearchParams({ status: 'active' }), { replace: false });

    expect(push).toHaveBeenCalledWith('/templates?status=active', { scroll: false });
    expect(replace).not.toHaveBeenCalled();
  });

  it('scrolls to the top when preserveScroll is off', () => {
    const { result } = renderHook(() => useNextRouterAdapter({ preserveScroll: false }));

    result.current.setSearchParams(new URLSearchParams({ status: 'active' }));

    expect(replace).toHaveBeenCalledWith('/templates?status=active', { scroll: true });
  });

  it('keeps the current pathname', () => {
    state.pathname = '/admin/templates';

    const { result } = renderHook(() => useNextRouterAdapter());

    result.current.setSearchParams(new URLSearchParams({ status: 'draft' }));

    expect(replace).toHaveBeenCalledWith('/admin/templates?status=draft', { scroll: false });
  });

  it('navigates to the bare pathname when every parameter is cleared', () => {
    state.search = 'status=draft';

    const { result } = renderHook(() => useNextRouterAdapter());

    result.current.setSearchParams(new URLSearchParams());

    expect(replace).toHaveBeenCalledWith('/templates', { scroll: false });
  });
});
