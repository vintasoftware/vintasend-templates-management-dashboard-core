'use client';

/**
 * Context that carries the client to the hooks.
 *
 * This deliberately does not create a `QueryClientProvider`: the app owns its
 * TanStack Query configuration, and nesting a second query client here would
 * silently split its cache. Render `TemplatesProvider` inside your own
 * `QueryClientProvider`.
 */

import { createContext, createElement, type ReactNode, useContext } from 'react';
import type { TemplatesClient } from './api/query.js';

const TemplatesClientContext = createContext<TemplatesClient | null>(null);

export type TemplatesProviderProps = {
  client: TemplatesClient;
  children: ReactNode;
};

export function TemplatesProvider({ client, children }: TemplatesProviderProps) {
  return createElement(TemplatesClientContext.Provider, { value: client }, children);
}

/**
 * The client from context. Every hook in this package calls this, and each of
 * them also accepts a `client` option that takes precedence — which is what
 * lets a component be used outside the provider, or against a second API.
 */
export function useTemplatesClient(override?: TemplatesClient): TemplatesClient {
  const fromContext = useContext(TemplatesClientContext);
  const client = override ?? fromContext;

  if (!client) {
    throw new Error(
      'No templates-management client found. Wrap your app in <TemplatesProvider client={createTemplatesClient(...)}> ' +
        'or pass a `client` option to the hook.',
    );
  }

  return client;
}
