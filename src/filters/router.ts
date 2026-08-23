'use client';

/**
 * How the filter hooks talk to a router.
 *
 * The point of this package is that the UI and its routing are yours, so the
 * hooks never import a router. They read and write search params through this
 * two-method interface; `useHistoryRouterAdapter` below implements it on the
 * History API and works in any React app, and the `/next` entry point ships one
 * for the Next.js app router.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type SetSearchParamsOptions = {
  /**
   * Replace the current history entry instead of pushing a new one. Filter
   * changes default to replacing, so a typed search term does not bury the
   * previous page under a dozen back-button steps.
   */
  replace?: boolean;
};

export type RouterAdapter = {
  /** The current query string. */
  searchParams: URLSearchParams;
  /** Navigate to `next`, preserving the current path. */
  setSearchParams: (next: URLSearchParams, options?: SetSearchParamsOptions) => void;
};

/**
 * Fired after this adapter writes to the History API. `pushState` and
 * `replaceState` emit no event of their own, so without this a write would
 * update the URL and leave every subscriber showing the old params.
 */
const SEARCH_PARAMS_EVENT = 'vintasend-templates:searchparams';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(SEARCH_PARAMS_EVENT, onChange);

  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(SEARCH_PARAMS_EVENT, onChange);
  };
}

function getSearchSnapshot(): string {
  return window.location.search;
}

/**
 * The snapshot used while server-rendering, and on the first client render
 * before hydration. An empty query string is the only honest answer here: the
 * server has no `window`, and returning anything else would make the two
 * renders disagree. Pass `initialSearch` when you do know the query on the
 * server — a Next app should use the adapter from the `/next` entry point,
 * which reads it from the router.
 */
function makeServerSnapshot(initialSearch: string) {
  return () => initialSearch;
}

export type HistoryRouterAdapterOptions = {
  /** Query string to render with on the server and during hydration. */
  initialSearch?: string;
};

/**
 * A `RouterAdapter` backed by `window.location` and `history.pushState`.
 * Framework-free, and enough for an app that has no router of its own.
 */
export function useHistoryRouterAdapter(options: HistoryRouterAdapterOptions = {}): RouterAdapter {
  const initialSearch = options.initialSearch ?? '';

  const serverSnapshot = useMemo(() => makeServerSnapshot(initialSearch), [initialSearch]);

  const search = useSyncExternalStore(subscribe, getSearchSnapshot, serverSnapshot);

  const searchParams = useMemo(() => new URLSearchParams(search), [search]);

  const setSearchParams = useCallback(
    (next: URLSearchParams, { replace = true }: SetSearchParamsOptions = {}) => {
      const query = next.toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;

      if (replace) {
        window.history.replaceState(window.history.state, '', url);
      } else {
        window.history.pushState(window.history.state, '', url);
      }

      window.dispatchEvent(new Event(SEARCH_PARAMS_EVENT));
    },
    [],
  );

  return useMemo(() => ({ searchParams, setSearchParams }), [searchParams, setSearchParams]);
}

/**
 * A `RouterAdapter` over a fixed query string that discards writes. Use it to
 * render filters from a URL you already have — a server render, a test, a
 * screenshot — where navigation is not possible or not wanted.
 */
export function createStaticRouterAdapter(search: string | URLSearchParams): RouterAdapter {
  return {
    searchParams: typeof search === 'string' ? new URLSearchParams(search) : search,
    setSearchParams: () => {},
  };
}
