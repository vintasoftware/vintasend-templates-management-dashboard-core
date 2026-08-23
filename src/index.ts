/**
 * vintasend-templates-management-dashboard-core
 *
 * The non-visual half of a VintaSend template-management dashboard: a client
 * generated from `openapi.yaml`, TanStack Query hooks over it, and template and
 * tag filters that live in the URL. No components and no opinion about
 * authentication, so an app can bring its own UI and its own session handling.
 *
 * ```tsx
 * const client = createTemplatesClient({ baseUrl: '/api/templates' });
 *
 * <QueryClientProvider client={queryClient}>
 *   <TemplatesProvider client={client}>
 *     <TemplateList />
 *   </TemplatesProvider>
 * </QueryClientProvider>
 * ```
 */

// Client
export {
  createTemplatesFetchClient,
  type TemplatesClientConfig,
  type TemplatesFetchClient,
} from './api/client.js';
// Errors
export {
  API_ERROR_CODES,
  getApiErrorCode,
  getApiErrorDetails,
  getApiErrorMessage,
  isApiErrorResponse,
  toApiErrorResponse,
} from './api/errors.js';
export {
  createTemplatesClient,
  createTemplatesQueryClient,
  type TemplatesClient,
  type TemplatesQueryClient,
} from './api/query.js';

// Contract types
export type {
  ApiErrorCode,
  CreateTagBody,
  CreateTemplateBody,
  CreateVersionBody,
  components,
  ErrorResponse,
  FilterCapabilities,
  ManagedTemplate,
  ManagedTemplateTag,
  operations,
  PaginatedTags,
  PaginatedTemplates,
  PreviewBody,
  paths,
  SetStatusBody,
  SetTemplateTagsBody,
  StatusChangeBody,
  TagFilters,
  TagListQuery,
  TagStatus,
  TemplateComposition,
  TemplateFilters,
  TemplateListQuery,
  TemplateOrderByField,
  TemplateOrderDirection,
  TemplatePreview,
  TemplateReference,
  TemplateStatus,
  TemplateStatusHistoryEntry,
  UpdateTagBody,
} from './api/types.js';
export {
  DEFAULT_MOST_RECENT_ACTIVE_VERSION,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_TAGS_PER_REQUEST,
  MIN_PAGE_SIZE,
  TAG_FILTER_KEYS,
  TAG_STATUSES,
  TAG_STRING_FILTER_KEYS,
  TEMPLATE_BOOLEAN_FILTER_KEYS,
  TEMPLATE_DATE_FILTER_KEYS,
  TEMPLATE_FILTER_KEYS,
  TEMPLATE_NARROWING_FILTER_KEYS,
  TEMPLATE_NUMBER_FILTER_KEYS,
  TEMPLATE_ORDER_BY_FIELDS,
  TEMPLATE_ORDER_DIRECTIONS,
  TEMPLATE_SORT_KEYS,
  TEMPLATE_STATUSES,
  TEMPLATE_STRING_FILTER_KEYS,
  TEMPLATE_TAG_FILTER_KEYS,
} from './filters/keys.js';
export {
  applyTagFilters,
  applyTemplateFilters,
  hasActiveTagFilters,
  hasActiveTemplateFilters,
  type PaginationState,
  parsePagination,
  parseTagFilters,
  parseTagListQuery,
  parseTemplateFilters,
  parseTemplateListQuery,
  pruneTagFilters,
  pruneTemplateFilters,
  type SearchParamsInput,
  serializeTagFilters,
  serializeTemplateFilters,
  toSearchParams,
} from './filters/parse.js';
export {
  createStaticRouterAdapter,
  type HistoryRouterAdapterOptions,
  type RouterAdapter,
  type SetSearchParamsOptions,
  useHistoryRouterAdapter,
} from './filters/router.js';
export {
  type TagFiltersState,
  type UseTagFiltersOptions,
  useTagFilters,
} from './filters/use-tag-filters.js';
// Filters
export {
  type TemplateFiltersState,
  type UseTemplateFiltersOptions,
  useTemplateFilters,
} from './filters/use-template-filters.js';
// Capabilities
export {
  orderableFields,
  orderByCapabilityKey,
  supportsFilter,
  supportsOrdering,
} from './hooks/capabilities.js';
// Mutation hooks
export {
  type MutationHookOptions,
  useActivateTemplate,
  useArchiveTag,
  useArchiveTemplate,
  useCreateTag,
  useCreateTemplate,
  useCreateTemplateVersion,
  useDeactivateTemplate,
  useDeleteTag,
  useDeleteTemplate,
  useDeleteTemplateVersion,
  usePreviewTemplate,
  useRestoreTag,
  useSetTemplateStatus,
  useSetTemplateTags,
  useUpdateTag,
} from './hooks/mutations.js';
// Query hooks
export {
  type QueryHookOptions,
  TAG_PATHS,
  TEMPLATE_PATHS,
  useCapabilities,
  useHealth,
  useInvalidateTags,
  useInvalidateTemplates,
  useTag,
  useTagsQuery,
  useTemplate,
  useTemplateComposition,
  useTemplateStatusHistory,
  useTemplatesApi,
  useTemplatesQuery,
  useTemplateVersion,
  useTemplateVersions,
  type WithClient,
} from './hooks/queries.js';
export {
  type UseFilteredTagsOptions,
  type UseFilteredTagsResult,
  useFilteredTags,
} from './hooks/use-filtered-tags.js';
// Filters + list, joined
export {
  type UseFilteredTemplatesOptions,
  type UseFilteredTemplatesResult,
  useFilteredTemplates,
} from './hooks/use-filtered-templates.js';
export {
  TemplatesProvider,
  type TemplatesProviderProps,
  useTemplatesClient,
} from './provider.js';
