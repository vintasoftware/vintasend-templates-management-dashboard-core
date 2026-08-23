'use client';

/**
 * URL tag filters joined to the tag list endpoint.
 *
 * The counterpart to `useFilteredTemplates` for a tag-management screen. Give
 * it a `paramPrefix` when it shares a URL with the template list, or the two
 * `status` filters collide.
 */

import { useCallback, useMemo } from 'react';
import type { ManagedTemplateTag } from '../api/types.js';
import {
  type TagFiltersState,
  type UseTagFiltersOptions,
  useTagFilters,
} from '../filters/use-tag-filters.js';
import { useTagsQuery, type WithClient } from './queries.js';

export type UseFilteredTagsOptions = UseTagFiltersOptions &
  WithClient & {
    query?: Record<string, unknown>;
  };

export type UseFilteredTagsResult = TagFiltersState & {
  tags: ManagedTemplateTag[];

  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextPage: () => void;
  previousPage: () => void;

  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;

  result: ReturnType<typeof useTagsQuery>;
};

export function useFilteredTags(options: UseFilteredTagsOptions = {}): UseFilteredTagsResult {
  const { client, query: queryOptions, ...filterOptions } = options;

  const filters = useTagFilters(filterOptions);

  const result = useTagsQuery(filters.query, {
    ...(client ? { client } : {}),
    ...(queryOptions ? { query: queryOptions } : {}),
  });

  const tags = useMemo<ManagedTemplateTag[]>(() => result.data?.data ?? [], [result.data]);

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
    tags,
    hasNextPage,
    hasPreviousPage,
    nextPage,
    previousPage,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch,
    result,
  };
}
