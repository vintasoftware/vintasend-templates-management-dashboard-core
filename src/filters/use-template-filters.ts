'use client';

/**
 * Template filters, held in the URL.
 *
 * The URL is the single source of truth: there is no local mirror of the filter
 * state to fall out of sync with it, so a filtered view is shareable, survives
 * a reload, and the back button steps through it. Every setter writes to the
 * router and the next render reads the result back.
 */

import { useCallback, useMemo } from 'react';
import type {
  TemplateFilters,
  TemplateListQuery,
  TemplateOrderByField,
  TemplateOrderDirection,
  TemplateStatus,
} from '../api/types.js';
import { DEFAULT_PAGE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from './keys.js';
import {
  applyTemplateFilters,
  hasActiveTemplateFilters,
  parsePagination,
  parseTemplateFilters,
  pruneTemplateFilters,
} from './parse.js';
import { type RouterAdapter, useHistoryRouterAdapter } from './router.js';

export type UseTemplateFiltersOptions = {
  /**
   * Where the filters live. Defaults to the History API adapter; a Next app
   * should pass `useNextRouterAdapter()` from the `/next` entry point.
   */
  router?: RouterAdapter;

  /**
   * Applied when the URL does not set a filter. A dashboard scoped to one
   * backend, for example, can pin `{ templateManagedBackend }` here rather than
   * requiring it in every link. `clearFilters` returns to these, not to nothing.
   */
  defaultFilters?: TemplateFilters;

  /** Page size when the URL does not carry one. */
  defaultPageSize?: number;

  /**
   * Whether a change adds a history entry. Filters default to `'replace'`, so
   * typing in a text filter does not fill the back stack.
   */
  navigationMode?: 'replace' | 'push';
};

export type TemplateFiltersState = {
  /** Current filters: the URL's values over `defaultFilters`. */
  filters: TemplateFilters;
  page: number;
  pageSize: number;

  /** Filters and pagination together, ready to hand to the list endpoint. */
  query: TemplateListQuery;

  /**
   * True when a narrowing filter is set. Ordering does not count, and neither
   * does `mostRecentActiveVersion` at its default.
   */
  hasActiveFilters: boolean;

  /** The full query string, including parameters this hook does not own. */
  searchParams: URLSearchParams;

  /** Replaces every filter. Accepts an updater, like `useState`. */
  setFilters: (next: TemplateFilters | ((previous: TemplateFilters) => TemplateFilters)) => void;

  /** Sets or clears one filter, leaving the rest alone. */
  setFilter: <K extends keyof TemplateFilters>(
    key: K,
    value: TemplateFilters[K] | undefined,
  ) => void;

  /** Merges a partial update; `undefined` clears a key. */
  patchFilters: (patch: Partial<TemplateFilters>) => void;

  /** Returns to `defaultFilters`, keeping the current ordering and page size. */
  clearFilters: () => void;

  /** Adds a status to the `status` filter if absent, removes it if present. */
  toggleStatus: (status: TemplateStatus) => void;

  /**
   * Adds a tag to one of the tag filters if absent, removes it if present.
   * `mode` picks which: `'all'` requires every tag, `'any'` at least one.
   */
  toggleTag: (tag: string, mode?: 'all' | 'any') => void;

  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;

  /**
   * Sets ordering, or clears it when called with no field.
   *
   * Asking for a field the backend cannot sort by is a **400**, not a silently
   * unordered page — check `supportsOrdering` before offering a column.
   */
  setSort: (field?: TemplateOrderByField, direction?: TemplateOrderDirection) => void;
};

function clampPageSize(pageSize: number): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.trunc(pageSize)));
}

/** Adds `value` to `list` when absent, removes it when present. */
function toggleInList<T>(list: readonly T[] | null | undefined, value: T): T[] | undefined {
  const current = list ?? [];
  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];

  return next.length > 0 ? next : undefined;
}

export function useTemplateFilters(options: UseTemplateFiltersOptions = {}): TemplateFiltersState {
  const { defaultFilters, defaultPageSize, navigationMode = 'replace' } = options;

  // Called unconditionally to respect the rules of hooks; ignored when the
  // caller supplied a router of their own.
  const historyRouter = useHistoryRouterAdapter();
  const router = options.router ?? historyRouter;

  const { searchParams, setSearchParams } = router;

  const filters = useMemo(
    () => ({
      ...pruneTemplateFilters(defaultFilters ?? {}),
      ...parseTemplateFilters(searchParams),
    }),
    [searchParams, defaultFilters],
  );

  const { page, pageSize } = useMemo(
    () =>
      parsePagination(
        searchParams,
        defaultPageSize === undefined ? {} : { pageSize: clampPageSize(defaultPageSize) },
      ),
    [searchParams, defaultPageSize],
  );

  const query = useMemo<TemplateListQuery>(
    () => ({ ...filters, page, pageSize }),
    [filters, page, pageSize],
  );

  const commit = useCallback(
    (nextFilters: TemplateFilters, nextPage: number, nextPageSize: number) => {
      setSearchParams(
        applyTemplateFilters(searchParams, nextFilters, {
          page: nextPage,
          pageSize: nextPageSize,
        }),
        { replace: navigationMode === 'replace' },
      );
    },
    [searchParams, setSearchParams, navigationMode],
  );

  const setFilters = useCallback<TemplateFiltersState['setFilters']>(
    (next) => {
      const resolved = typeof next === 'function' ? next(filters) : next;

      // A narrower result set makes the current page number meaningless, and
      // page 4 of a 2-page result is an empty table rather than an error.
      commit(pruneTemplateFilters(resolved), DEFAULT_PAGE, pageSize);
    },
    [commit, filters, pageSize],
  );

  const patchFilters = useCallback<TemplateFiltersState['patchFilters']>(
    (patch) => {
      setFilters({ ...filters, ...patch });
    },
    [setFilters, filters],
  );

  const setFilter = useCallback<TemplateFiltersState['setFilter']>(
    (key, value) => {
      patchFilters({ [key]: value } as Partial<TemplateFilters>);
    },
    [patchFilters],
  );

  const clearFilters = useCallback(() => {
    // Back to the defaults, but ordering is a view preference rather than a
    // filter, so clearing the filters leaves the chosen sort in place.
    const cleared: TemplateFilters = { ...pruneTemplateFilters(defaultFilters ?? {}) };

    if (filters.orderByField !== undefined) {
      cleared.orderByField = filters.orderByField;

      if (filters.orderByDirection !== undefined) {
        cleared.orderByDirection = filters.orderByDirection;
      }
    }

    commit(cleared, DEFAULT_PAGE, pageSize);
  }, [commit, defaultFilters, filters, pageSize]);

  const toggleStatus = useCallback(
    (status: TemplateStatus) => {
      setFilters({ ...filters, status: toggleInList(filters.status, status) });
    },
    [setFilters, filters],
  );

  const toggleTag = useCallback(
    (tag: string, mode: 'all' | 'any' = 'all') => {
      const key = mode === 'all' ? 'includesAllTags' : 'includesAnyOfTags';

      setFilters({ ...filters, [key]: toggleInList(filters[key], tag) });
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
      // Page numbers do not survive a resize, so go back to the first one.
      commit(filters, DEFAULT_PAGE, clampPageSize(nextPageSize));
    },
    [commit, filters],
  );

  const setSort = useCallback<TemplateFiltersState['setSort']>(
    (field, direction) => {
      const next: TemplateFilters = { ...filters };

      if (field === undefined) {
        // A direction with nothing to order is a 400, so both go together.
        delete next.orderByField;
        delete next.orderByDirection;
      } else {
        next.orderByField = field;
        next.orderByDirection = direction ?? 'asc';
      }

      commit(next, DEFAULT_PAGE, pageSize);
    },
    [commit, filters, pageSize],
  );

  return useMemo(
    () => ({
      filters,
      page,
      pageSize,
      query,
      hasActiveFilters: hasActiveTemplateFilters(filters),
      searchParams,
      setFilters,
      setFilter,
      patchFilters,
      clearFilters,
      toggleStatus,
      toggleTag,
      setPage,
      setPageSize,
      setSort,
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
      toggleTag,
      setPage,
      setPageSize,
      setSort,
    ],
  );
}
