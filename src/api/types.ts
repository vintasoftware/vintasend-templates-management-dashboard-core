/**
 * Convenience aliases over the generated OpenAPI schema.
 *
 * `schema.ts` is generated from the API's `openapi.yaml` and is the source of
 * truth; regenerate it with `npm run generate:api` and never edit it by hand.
 * Everything here is a type alias into it, so the contract stays single-sourced
 * while consumers get names they can import without indexing into `components`
 * or spelling out an operation id.
 *
 * The generated names are unwieldy on purpose — the contract is shared verbatim
 * with a Python implementation, and its `operationId`s and generic schema names
 * (`PaginatedResponse_ManagedTemplateOut_`) come from there.
 */

import type { components, operations, paths } from './schema.js';

type Schemas = components['schemas'];

type Operation<Name extends keyof operations> = operations[Name];

type QueryOf<Name extends keyof operations> = NonNullable<Operation<Name>['parameters']['query']>;

/** One version of a managed template. */
export type ManagedTemplate = Schemas['ManagedTemplateOut'];

/** A label attached to any number of template versions. */
export type ManagedTemplateTag = Schemas['ManagedTemplateTagOut'];

export type TemplateComposition = Schemas['TemplateCompositionOut'];
export type TemplateReference = Schemas['TemplateReferenceOut'];
export type TemplateStatusHistoryEntry = Schemas['TemplateStatusHistoryOut'];
export type TemplatePreview = Schemas['TemplatePreviewOut'];

export type CreateTemplateBody = Schemas['CreateTemplateBody'];
export type CreateVersionBody = Schemas['CreateVersionBody'];
export type SetStatusBody = Schemas['SetStatusBody'];
export type StatusChangeBody = Schemas['StatusChangeBody'];
export type PreviewBody = Schemas['PreviewBody'];
export type SetTemplateTagsBody = Schemas['SetTemplateTagsBody'];
export type CreateTagBody = Schemas['CreateTagBody'];
export type UpdateTagBody = Schemas['UpdateTagBody'];

export type ErrorResponse = Schemas['ApiErrorResponse'];
export type ApiErrorCode = Schemas['ApiErrorBody']['code'];

export type PaginatedTemplates = Schemas['PaginatedResponse_ManagedTemplateOut_'];
export type PaginatedTags = Schemas['PaginatedResponse_ManagedTemplateTagOut_'];

/**
 * Filter and ordering capabilities of the configured backend, as flat dotted
 * keys. The two namespaces have **opposite defaults** — see
 * `supportsFilter` and `supportsOrdering` in `../hooks/capabilities.js`.
 */
export type FilterCapabilities = Record<string, boolean>;

/**
 * Every query parameter `GET /api/v1/templates` accepts, pagination included.
 * Read off the generated operation so a contract change surfaces here as a type
 * error rather than a silently dropped filter.
 */
export type TemplateListQuery =
  QueryOf<'vintasend_templates_management_api_templates_manager_api_list_templates'>;

/** Every query parameter `GET /api/v1/tags` accepts. */
export type TagListQuery =
  QueryOf<'vintasend_templates_management_api_templates_manager_api_list_tags'>;

/**
 * The filter half of the template list query: everything except pagination.
 * This is the state `useTemplateFilters` mirrors into the URL.
 */
export type TemplateFilters = Omit<TemplateListQuery, 'page' | 'pageSize'>;

/** The filter half of the tag list query. */
export type TagFilters = Omit<TagListQuery, 'page' | 'pageSize'>;

export type TemplateStatus = NonNullable<ManagedTemplate['status']>;
export type TagStatus = NonNullable<ManagedTemplateTag['status']>;

export type TemplateOrderByField = NonNullable<NonNullable<TemplateListQuery['orderByField']>>;
export type TemplateOrderDirection = NonNullable<
  NonNullable<TemplateListQuery['orderByDirection']>
>;

export type { components, operations, paths } from './schema.js';
