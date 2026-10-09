'use client';

/**
 * TanStack Router binding.
 *
 * Kept behind its own entry point
 * (`vintasend-templates-management-dashboard-core/tanstack-router`) so that
 * `@tanstack/react-router` stays an optional peer dependency, like `next` is
 * for `/next`.
 */

import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import type { RouterAdapter, SetSearchParamsOptions } from '../filters/router.js';

type Search = Record<string, unknown>;

export type TanStackRouterAdapterOptions = {
  /**
   * Keep the scroll position on navigation. On by default: a filter change
   * rewrites the same table, and jumping to the top of the page each keystroke
   * is disorienting.
   */
  preserveScroll?: boolean;
};

/** One search value as the query-string entries it stands for. */
function entries(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(entries);
  }
  return [typeof value === 'object' ? JSON.stringify(value) : String(value)];
}

function sameEntries(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

/**
 * A `RouterAdapter` over TanStack Router.
 *
 * TanStack Router writes the URL in its own format: it JSON-encodes arrays and
 * quotes a string that would otherwise read as a number or a boolean
 * (`version=%223%22`). Reading the raw query string back would hand the filter
 * parser `"3"` and `'["draft","inactive"]'`, which it rightly drops. So this
 * reads the search TanStack Router has already parsed and flattens it — an
 * array into a repeated key, anything else through `String()` — and writes
 * plain values back for it to encode its own way.
 *
 * A parameter the filters left as they found it is written back exactly as it
 * was read, so the app's own search parameters — structured ones included —
 * survive a filter change untouched.
 *
 * The component that calls it must render inside a `RouterProvider`.
 */
export function useTanStackRouterAdapter(
  options: TanStackRouterAdapterOptions = {},
): RouterAdapter {
  const { preserveScroll = true } = options;

  const search = useSearch({ strict: false }) as Search;
  const navigate = useNavigate();

  const searchParams = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      for (const entry of entries(value)) {
        params.append(key, entry);
      }
    }
    return params;
  }, [search]);

  const setSearchParams = useCallback(
    (next: URLSearchParams, { replace = true }: SetSearchParamsOptions = {}) => {
      const nextSearch: Search = {};
      for (const key of new Set(next.keys())) {
        const values = next.getAll(key);
        nextSearch[key] = sameEntries(entries(search[key]), values)
          ? search[key]
          : values.length === 1
            ? values[0]
            : values;
      }

      void navigate({ search: nextSearch as never, replace, resetScroll: !preserveScroll });
    },
    [navigate, search, preserveScroll],
  );

  return useMemo(() => ({ searchParams, setSearchParams }), [searchParams, setSearchParams]);
}
