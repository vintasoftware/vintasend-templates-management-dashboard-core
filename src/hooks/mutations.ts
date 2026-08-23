'use client';

/**
 * Write endpoints.
 *
 * Variables keep the generated shape — `{ params: { path: { key } }, body }` —
 * because that is what stays correct as `openapi.yaml` changes. What these add
 * over the raw client is cache invalidation: forgetting it is the usual way a
 * dashboard ends up showing a template in the status it had before the click.
 *
 * Templates are versioned rather than edited in place, so there is no "update
 * template" here: `useCreateTemplateVersion` is the edit. Every field on its
 * body is optional and an omitted one is carried forward from the latest
 * version.
 */

import type { TemplatesClient } from '../api/query.js';
import {
  useInvalidateTags,
  useInvalidateTemplates,
  useTemplatesApi,
  type WithClient,
} from './queries.js';

/**
 * Mutation options forwarded to TanStack Query. Left loose because the exact
 * type depends on the endpoint; the generated client checks the call itself.
 */
type MutationOptions = Record<string, unknown>;

export type MutationHookOptions = WithClient & { mutation?: MutationOptions };

/**
 * Runs the caller's `onSuccess` after ours, so an app can chain a toast or a
 * redirect onto the invalidation instead of replacing it.
 */
function withInvalidation(
  options: MutationOptions | undefined,
  invalidate: () => Promise<void>,
): MutationOptions {
  const callerOnSuccess = options?.onSuccess as ((...args: unknown[]) => unknown) | undefined;

  return {
    ...options,
    onSuccess: async (...args: unknown[]) => {
      await invalidate();

      return callerOnSuccess?.(...args);
    },
  };
}

// --- templates -------------------------------------------------------------

/**
 * Creates a template's first version.
 *
 * ```ts
 * createTemplate.mutate({ body: { key: 'welcome', name: 'Welcome', bodyTemplate: '…' } });
 * ```
 */
export function useCreateTemplate(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTemplates();

  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/templates',
    withInvalidation(options.mutation, invalidate),
  );
}

/**
 * Adds a version to an existing template — this API's equivalent of an edit.
 * Omitted fields are copied forward from the latest version.
 *
 * ```ts
 * createVersion.mutate({ params: { path: { key } }, body: { bodyTemplate: '…' } });
 * ```
 */
export function useCreateTemplateVersion(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTemplates();

  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/templates/{key}/versions',
    withInvalidation(options.mutation, invalidate),
  );
}

/** Deletes a template and every version of it. */
export function useDeleteTemplate(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTemplates();

  return useTemplatesApi(options).useMutation(
    'delete',
    '/api/v1/templates/{key}',
    withInvalidation(options.mutation, invalidate),
  );
}

/** Deletes one version of a template. */
export function useDeleteTemplateVersion(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTemplates();

  return useTemplatesApi(options).useMutation(
    'delete',
    '/api/v1/templates/{key}/versions/{version}',
    withInvalidation(options.mutation, invalidate),
  );
}

// --- status lifecycle ------------------------------------------------------

/**
 * Moves a template to an arbitrary status.
 *
 * A move the lifecycle does not allow answers `INVALID_STATUS_TRANSITION`. Each
 * template reports its legal next steps in `allowedTransitions`, so a UI can
 * offer only those and never provoke it.
 */
export function useSetTemplateStatus(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTemplates();

  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/templates/{key}/status',
    withInvalidation(options.mutation, invalidate),
  );
}

/** Shorthand for the `active` transition. */
export function useActivateTemplate(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTemplates();

  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/templates/{key}/activate',
    withInvalidation(options.mutation, invalidate),
  );
}

/** Shorthand for the `inactive` transition. */
export function useDeactivateTemplate(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTemplates();

  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/templates/{key}/deactivate',
    withInvalidation(options.mutation, invalidate),
  );
}

/** Shorthand for the `archived` transition. */
export function useArchiveTemplate(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTemplates();

  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/templates/{key}/archive',
    withInvalidation(options.mutation, invalidate),
  );
}

// --- preview ---------------------------------------------------------------

/**
 * Renders a version against a supplied context.
 *
 * A POST, and therefore a mutation rather than a query — but it changes
 * nothing, so it deliberately does **not** invalidate anything. Drive a live
 * preview pane from `mutate` on a debounce, or hold the result in local state.
 *
 * ```ts
 * preview.mutate({ params: { path: { key } }, body: { context: { name: 'Ada' } } });
 * ```
 */
export function usePreviewTemplate(options: MutationHookOptions = {}) {
  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/templates/{key}/preview',
    options.mutation,
  );
}

// --- tags ------------------------------------------------------------------

/**
 * Replaces a template version's tags outright — this is a PUT, not a merge, so
 * send the full set and an empty list clears them.
 */
export function useSetTemplateTags(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTemplates();

  return useTemplatesApi(options).useMutation(
    'put',
    '/api/v1/templates/{key}/tags',
    withInvalidation(options.mutation, invalidate),
  );
}

/**
 * Creates a tag. The slug is derived from `text` by the server and is not a
 * client's to set.
 */
export function useCreateTag(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTags();

  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/tags',
    withInvalidation(options.mutation, invalidate),
  );
}

/** Renames a tag. */
export function useUpdateTag(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTags();

  return useTemplatesApi(options).useMutation(
    'patch',
    '/api/v1/tags/{slug}',
    withInvalidation(options.mutation, invalidate),
  );
}

/** Deletes a tag outright. Archiving is usually what you want instead. */
export function useDeleteTag(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTags();

  return useTemplatesApi(options).useMutation(
    'delete',
    '/api/v1/tags/{slug}',
    withInvalidation(options.mutation, invalidate),
  );
}

/**
 * Archives a tag: it stays attached to the templates carrying it and stays
 * filterable, but is no longer offered in a picker.
 */
export function useArchiveTag(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTags();

  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/tags/{slug}/archive',
    withInvalidation(options.mutation, invalidate),
  );
}

/** Brings an archived tag back into circulation. */
export function useRestoreTag(options: MutationHookOptions = {}) {
  const invalidate = useInvalidateTags();

  return useTemplatesApi(options).useMutation(
    'post',
    '/api/v1/tags/{slug}/restore',
    withInvalidation(options.mutation, invalidate),
  );
}

export type { TemplatesClient };
