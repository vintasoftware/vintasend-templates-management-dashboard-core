'use client';

/**
 * Next.js app-router binding.
 *
 * Kept behind its own entry point (`vintasend-templates-management-dashboard-core/next`) so that
 * `next` stays an optional peer dependency: a Vite or react-router app can use
 * the rest of the package without it resolving `next/navigation` at all.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { RouterAdapter, SetSearchParamsOptions } from '../filters/router.js';

export type NextRouterAdapterOptions = {
  /**
   * Keep the scroll position on navigation. On by default: a filter change
   * rewrites the same table, and jumping to the top of the page each keystroke
   * is disorienting.
   */
  preserveScroll?: boolean;
};

/**
 * A `RouterAdapter` over `next/navigation`. Navigating through the router
 * rather than the History API is what lets a server component re-render with
 * the new filters, so a Next dashboard should always use this one.
 *
 * The component that calls it must be a client component, and — as Next
 * requires of anything reading search params — should sit under a `<Suspense>`
 * boundary, or the route opts out of static rendering.
 */
export function useNextRouterAdapter(options: NextRouterAdapterOptions = {}): RouterAdapter {
  const { preserveScroll = true } = options;

  const router = useRouter();
  const pathname = usePathname();
  const nextSearchParams = useSearchParams();

  // Next's ReadonlyURLSearchParams is not a URLSearchParams, and callers are
  // free to mutate what they get back, so hand out a copy.
  const searchParams = useMemo(
    () => new URLSearchParams(nextSearchParams?.toString() ?? ''),
    [nextSearchParams],
  );

  const setSearchParams = useCallback(
    (next: URLSearchParams, { replace = true }: SetSearchParamsOptions = {}) => {
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      if (replace) {
        router.replace(url, { scroll: !preserveScroll });
      } else {
        router.push(url, { scroll: !preserveScroll });
      }
    },
    [router, pathname, preserveScroll],
  );

  return useMemo(() => ({ searchParams, setSearchParams }), [searchParams, setSearchParams]);
}
