'use client';

/**
 * Tag filters, held in the URL.
 *
 * The tag list is a much smaller surface than the template list — status,
 * a text search, and a tenant — but it wants the same URL-as-state treatment so
 * a tag-management screen is bookmarkable.
 *
 * Tag filters are read from and written to the same query string as the
 * template ones, and both use a `status` parameter. Give one of the two a
 * `paramPrefix` when a screen shows both lists at once, or their statuses will
 * fight over the same key.
 */

import { useCallback, useMemo } from 'react';
import type { TagFilters, TagListQuery, TagStatus } from '../api/types.js';
import { DEFAULT_PAGE, MAX_PAGE_SIZE, MIN_PAGE_SIZE, TAG_FILTER_KEYS } from './keys.js';
import {
  applyTagFilters,
  hasActiveTagFilters,
  parsePagination,
  parseTagFilters,
  pruneTagFilters,
} from './parse.js';
import { type RouterAdapter, useHistoryRouterAdapter } from './router.js';

export type UseTagFiltersOptions = {
  router?: RouterAdapter;
  defaultFilters?: TagFilters;
  defaultPageSize?: number;
  navigationMode?: 'replace' | 'push';

  /**
   * Prefix for this hook's URL parameters — `'tag'` turns `status` into
   * `tagStatus` and `page` into `tagPage`. Use it when a screen drives two
   * lists from one query string.
   */
  paramPrefix?: string;
};

export type TagFiltersState = {
  filters: TagFilters;
  page: number;
  pageSize: number;
  query: TagListQuery;
  hasActiveFilters: boolean;
  searchParams: URLSearchParams;

  setFilters: (next: TagFilters | ((previous: TagFilters) => TagFilters)) => void;
  setFilter: <K extends keyof TagFilters>(key: K, value: TagFilters[K] | undefined) => void;
  patchFilters: (patch: Partial<TagFilters>) => void;
  clearFilters: () => void;

  /** Adds a status to the `status` filter if absent, removes it if present. */
  toggleStatus: (status: TagStatus) => void;

  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
};

const PREFIXED_KEYS = [...TAG_FILTER_KEYS, 'page', 'pageSize'] as const;

function applyPrefix(key: string, prefix: string | undefined): string {
  return prefix ? `${prefix}${key[0]?.toUpperCase() ?? ''}${key.slice(1)}` : key;
}

/**
 * A view of `params` with this hook's prefixed keys renamed back to their
 * contract names, so the shared parsers can read it unchanged.
 */
function stripPrefix(params: URLSearchParams, prefix: string | undefined): URLSearchParams {
  if (!prefix) {
    return params;
  }

  const stripped = new URLSearchParams();

  for (const key of PREFIXED_KEYS) {
    for (const value of params.getAll(applyPrefix(key, prefix))) {
      stripped.append(key, value);
    }
  }

  return stripped;
}

/** Merges a prefix-free write back into the full query string under the prefix. */
function mergePrefixed(
  params: URLSearchParams,
  written: URLSearchParams,
  prefix: string | undefined,
): URLSearchParams {
  if (!prefix) {
    return written;
  }

  const merged = new URLSearchParams(params);

  for (const key of PREFIXED_KEYS) {
    const prefixed = applyPrefix(key, prefix);

    merged.delete(prefixed);

    for (const value of written.getAll(key)) {
      merged.append(prefixed, value);
    }
  }

  return merged;
}

function clampPageSize(pageSize: number): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.trunc(pageSize)));
}

function toggleInList<T>(list: readonly T[] | null | undefined, value: T): T[] | undefined {
  const current = list ?? [];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];

  return next.length > 0 ? next : undefined;
}

export function useTagFilters(options: UseTagFiltersOptions = {}): TagFiltersState {
  const { defaultFilters, defaultPageSize, navigationMode = 'replace', paramPrefix } = options;

  const historyRouter = useHistoryRouterAdapter();
  const router = options.router ?? historyRouter;

  const { searchParams, setSearchParams } = router;

  const ownParams = useMemo(
    () => stripPrefix(searchParams, paramPrefix),
    [searchParams, paramPrefix],
  );

  const filters = useMemo(
    () => ({ ...pruneTagFilters(defaultFilters ?? {}), ...parseTagFilters(ownParams) }),
    [ownParams, defaultFilters],
  );

  const { page, pageSize } = useMemo(
    () =>
      parsePagination(
        ownParams,
        defaultPageSize === undefined ? {} : { pageSize: clampPageSize(defaultPageSize) },
      ),
    [ownParams, defaultPageSize],
  );

  const query = useMemo<TagListQuery>(
    () => ({ ...filters, page, pageSize }),
    [filters, page, pageSize],
  );

  const commit = useCallback(
    (nextFilters: TagFilters, nextPage: number, nextPageSize: number) => {
      const written = applyTagFilters(ownParams, nextFilters, {
        page: nextPage,
        pageSize: nextPageSize,
      });

      setSearchParams(mergePrefixed(searchParams, written, paramPrefix), {
        replace: navigationMode === 'replace',
      });
    },
    [ownParams, searchParams, setSearchParams, navigationMode, paramPrefix],
  );

  const setFilters = useCallback<TagFiltersState['setFilters']>(
    (next) => {
      const resolved = typeof next === 'function' ? next(filters) : next;

      commit(pruneTagFilters(resolved), DEFAULT_PAGE, pageSize);
    },
    [commit, filters, pageSize],
  );

  const patchFilters = useCallback<TagFiltersState['patchFilters']>(
    (patch) => {
      setFilters({ ...filters, ...patch });
    },
    [setFilters, filters],
  );

  const setFilter = useCallback<TagFiltersState['setFilter']>(
    (key, value) => {
      patchFilters({ [key]: value } as Partial<TagFilters>);
    },
    [patchFilters],
  );

  const clearFilters = useCallback(() => {
    commit(pruneTagFilters(defaultFilters ?? {}), DEFAULT_PAGE, pageSize);
  }, [commit, defaultFilters, pageSize]);

  const toggleStatus = useCallback(
    (status: TagStatus) => {
      setFilters({ ...filters, status: toggleInList(filters.status, status) });
    },
    [setFilters, filters],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      commit(filters, Math.max(1, Math.trunc(nextPage)), pageSize);
    },
    [commit, filters, pageSize],
  );

  const setPageSize = useCallback(
    (nextPageSize: number) => {
      commit(filters, DEFAULT_PAGE, clampPageSize(nextPageSize));
    },
    [commit, filters],
  );

  return useMemo(
    () => ({
      filters,
      page,
      pageSize,
      query,
      hasActiveFilters: hasActiveTagFilters(filters),
      searchParams,
      setFilters,
      setFilter,
      patchFilters,
      clearFilters,
      toggleStatus,
      setPage,
      setPageSize,
    }),
    [
      filters,
      page,
      pageSize,
      query,
      searchParams,
      setFilters,
      setFilter,
      patchFilters,
      clearFilters,
      toggleStatus,
      setPage,
      setPageSize,
    ],
  );
}
