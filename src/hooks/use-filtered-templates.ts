'use client';

/**
 * The URL and the list endpoint, joined.
 *
 * This is the hook most template dashboards want: filters read from the URL,
 * fed to the generated TanStack Query hook, with pagination helpers that know
 * whether a next page exists. Everything it returns is also available piecemeal
 * from `useTemplateFilters` and `useTemplatesQuery`, for a UI that needs to
 * arrange the two differently.
 *
 * It also resolves the backend's ordering capabilities, because a sortable
 * column here is not a free choice: asking for a field the backend cannot sort
 * by is a 400.
 *
 * ```tsx
 * const { templates, filters, setFilter, sortableFields, nextPage } =
 *   useFilteredTemplates({ router: useNextRouterAdapter() });
 * ```
 */

import { useCallback, useMemo } from 'react';
import type { ManagedTemplate, TemplateOrderByField } from '../api/types.js';
import {
  type TemplateFiltersState,
  type UseTemplateFiltersOptions,
  useTemplateFilters,
} from '../filters/use-template-filters.js';
import { orderableFields, supportsOrdering } from './capabilities.js';
import { useCapabilities, useTemplatesQuery, type WithClient } from './queries.js';

export type UseFilteredTemplatesOptions = UseTemplateFiltersOptions &
  WithClient & {
    /** Options forwarded to the underlying TanStack query. */
    query?: Record<string, unknown>;

    /**
     * Skip the capabilities request. `sortableFields` is then empty and
     * `canSortBy` always false, so do this only when the UI offers no sorting.
     */
    skipCapabilities?: boolean;
  };

export type UseFilteredTemplatesResult = TemplateFiltersState & {
  /** The current page's rows, or an empty array while loading or on error. */
  templates: ManagedTemplate[];

  /** True when the page came back full, so another page may exist. */
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: () => void;
  previousPage: () => void;

  /**
   * The fields this backend can sort by. Render sortable column headers from
   * this and nothing else — the contract defines more fields than any given
   * backend supports.
   */
  sortableFields: TemplateOrderByField[];

  /** Whether one field is sortable. False while the capabilities are loading. */
  canSortBy: (field: TemplateOrderByField) => boolean;

  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;

  /** The full query result, for anything the fields above do not expose. */
  result: ReturnType<typeof useTemplatesQuery>;
};

export function useFilteredTemplates(
  options: UseFilteredTemplatesOptions = {},
): UseFilteredTemplatesResult {
  const { client, query: queryOptions, skipCapabilities, ...filterOptions } = options;

  const filters = useTemplateFilters(filterOptions);

  const clientOption = client ? { client } : {};

  const result = useTemplatesQuery(filters.query, {
    ...clientOption,
    ...(queryOptions ? { query: queryOptions } : {}),
  });

  const capabilities = useCapabilities({
    ...clientOption,
    query: { enabled: !skipCapabilities },
  });

  const templates = useMemo<ManagedTemplate[]>(() => result.data?.data ?? [], [result.data]);

  const capabilityMap = capabilities.data?.data;

  const sortableFields = useMemo(() => orderableFields(capabilityMap), [capabilityMap]);

  const canSortBy = useCallback(
    (field: TemplateOrderByField) => supportsOrdering(capabilityMap, field),
    [capabilityMap],
  );

  // The API reports `hasMore` rather than a total count, because a backend is
  // not required to be able to count.
  const hasNextPage = result.data?.hasMore ?? false;
  const hasPreviousPage = filters.page > 1;

  const { page, setPage } = filters;

  const nextPage = useCallback(() => {
    if (hasNextPage) {
      setPage(page + 1);
    }
  }, [hasNextPage, page, setPage]);

  const previousPage = useCallback(() => {
    if (page > 1) {
      setPage(page - 1);
    }
  }, [page, setPage]);

  const refetch = useCallback(() => {
    void result.refetch();
  }, [result]);

  return {
    ...filters,
    templates,
    hasNextPage,
    hasPreviousPage,
    nextPage,
    previousPage,
    sortableFields,
    canSortBy,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch,
    result,
  };
}
