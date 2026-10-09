import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStaticRouterAdapter } from '../src/filters/router.js';
import { useFilterText } from '../src/filters/use-filter-text.js';
import { useTemplateFilters } from '../src/filters/use-template-filters.js';

/**
 * A filter in the URL, as the filter hooks hold one: written by `onCommit`,
 * read back trimmed. `routerDelay` stands for a router that takes a moment to
 * update the URL.
 */
function useUrlFilter(initial: string | undefined, routerDelay = 0) {
  const [value, setValue] = useState(initial);
  const commits = useState<(string | undefined)[]>(() => [])[0];

  const search = useFilterText(value, (next) => {
    commits.push(next);
    if (routerDelay === 0) {
      setValue(next?.trim());
    } else {
      setTimeout(() => setValue(next?.trim()), routerDelay);
    }
  });

  return { value, setValue, search, commits };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function type(result: { current: ReturnType<typeof useUrlFilter> }, text: string) {
  act(() => result.current.search.setText(text));
}

function pause(ms = 300) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('useFilterText', () => {
  it('keeps every space that was typed while writing the trimmed value', () => {
    const { result } = renderHook(() => useUrlFilter(undefined));

    for (const text of ['a', 'ap', 'appointment', 'appointment ']) {
      type(result, text);
    }
    pause();
    expect(result.current.search.text).toBe('appointment ');
    expect(result.current.value).toBe('appointment');

    type(result, 'appointment r');
    pause();

    expect(result.current.search.text).toBe('appointment r');
    expect(result.current.value).toBe('appointment r');
  });

  it('writes once typing pauses, not once per keystroke', () => {
    const { result } = renderHook(() => useUrlFilter(undefined));

    for (const text of ['w', 'we', 'wel', 'welc']) {
      type(result, text);
      pause(100);
    }
    expect(result.current.commits).toEqual([]);

    pause(200);

    expect(result.current.commits).toEqual(['welc']);
  });

  it('writes nothing for a space that does not change the filter', () => {
    const { result } = renderHook(() => useUrlFilter('welcome'));

    type(result, 'welcome ');
    pause();

    expect(result.current.commits).toEqual([]);
    expect(result.current.search.text).toBe('welcome ');
  });

  it('clears the filter when only blanks are left', () => {
    const { result } = renderHook(() => useUrlFilter('welcome'));

    type(result, '   ');
    pause();

    expect(result.current.commits).toEqual([undefined]);
    expect(result.current.value).toBeUndefined();
  });

  it('follows the URL when it changes from outside, dropping a write still waiting', () => {
    // Clear filters, or the back button, while the user is mid-word.
    const { result } = renderHook(() => useUrlFilter('welcome'));

    type(result, 'welcome bac');
    act(() => result.current.setValue(undefined));
    pause();

    expect(result.current.search.text).toBe('');
    expect(result.current.commits).toEqual([]);
  });

  it('keeps typing that went on while the router caught up with an earlier write', () => {
    const { result } = renderHook(() => useUrlFilter(undefined, 1000));

    type(result, 'foo');
    pause();
    type(result, 'foob');
    pause(1000);

    // `foo` has reached the URL after `foob` was written: an old write, not a
    // change from outside.
    expect(result.current.value).toBe('foo');
    expect(result.current.search.text).toBe('foob');

    pause(300);

    expect(result.current.value).toBe('foob');
    expect(result.current.search.text).toBe('foob');
  });

  it('writes a clear made while an earlier write is still on its way', () => {
    const { result } = renderHook(() => useUrlFilter(undefined, 1000));

    type(result, 'foo');
    pause();
    type(result, '');
    pause();
    pause(1000);

    expect(result.current.commits).toEqual(['foo', undefined]);
    expect(result.current.value).toBeUndefined();
    expect(result.current.search.text).toBe('');
  });

  it('writes at once on flush', () => {
    const { result } = renderHook(() => useUrlFilter(undefined));

    type(result, 'welcome');
    act(() => result.current.search.flush());

    expect(result.current.commits).toEqual(['welcome']);
    pause();
    expect(result.current.commits).toEqual(['welcome']);
  });

  it('drops a write still waiting when the input goes away', () => {
    const { result, unmount } = renderHook(() => useUrlFilter(undefined));

    type(result, 'welcome');
    const { commits } = result.current;
    unmount();
    pause();

    expect(commits).toEqual([]);
  });

  it('keeps the spaces of a search bound to the URL filters', () => {
    // The bug it exists for: `filters.name` is read back trimmed, so an input
    // bound to it straight drops the space before the next word arrives.
    let search = '';
    const router = () => ({
      ...createStaticRouterAdapter(search),
      setSearchParams: (next: URLSearchParams) => {
        search = next.toString();
      },
    });

    const { result, rerender } = renderHook(() => {
      const filters = useTemplateFilters({ router: router() });
      const text = useFilterText(filters.filters.name, (name) => filters.setFilter('name', name));
      return { filters, text };
    });

    act(() => result.current.text.setText('appointment '));
    pause();
    rerender();
    act(() => result.current.text.setText('appointment reminder'));
    pause();
    rerender();

    expect(result.current.text.text).toBe('appointment reminder');
    expect(result.current.filters.filters.name).toBe('appointment reminder');
  });
});
