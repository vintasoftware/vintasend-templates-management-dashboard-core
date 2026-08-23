import { describe, expect, it } from 'vitest';
import * as pkg from '../src/index.js';

/**
 * The entry point is hand-maintained, so it is the easiest thing in the package
 * to leave a new hook out of. This asserts the surface consumers are told about
 * in the README actually exists.
 */
const EXPECTED_EXPORTS = [
  // client
  'createTemplatesClient',
  'createTemplatesFetchClient',
  'createTemplatesQueryClient',
  'TemplatesProvider',
  'useTemplatesClient',
  'useTemplatesApi',
  // reads
  'useTemplatesQuery',
  'useTemplate',
  'useTemplateVersions',
  'useTemplateVersion',
  'useTemplateComposition',
  'useTemplateStatusHistory',
  'useTagsQuery',
  'useTag',
  'useCapabilities',
  'useHealth',
  // writes
  'useCreateTemplate',
  'useCreateTemplateVersion',
  'useDeleteTemplate',
  'useDeleteTemplateVersion',
  'useSetTemplateStatus',
  'useActivateTemplate',
  'useDeactivateTemplate',
  'useArchiveTemplate',
  'usePreviewTemplate',
  'useSetTemplateTags',
  'useCreateTag',
  'useUpdateTag',
  'useDeleteTag',
  'useArchiveTag',
  'useRestoreTag',
  // invalidation
  'useInvalidateTemplates',
  'useInvalidateTags',
  // filters
  'useFilteredTemplates',
  'useFilteredTags',
  'useTemplateFilters',
  'useTagFilters',
  'useHistoryRouterAdapter',
  'createStaticRouterAdapter',
  'parseTemplateFilters',
  'parseTagFilters',
  'parseTemplateListQuery',
  'parseTagListQuery',
  'parsePagination',
  'applyTemplateFilters',
  'applyTagFilters',
  'serializeTemplateFilters',
  'serializeTagFilters',
  'pruneTemplateFilters',
  'pruneTagFilters',
  'hasActiveTemplateFilters',
  'hasActiveTagFilters',
  'toSearchParams',
  // capabilities
  'supportsFilter',
  'supportsOrdering',
  'orderableFields',
  'orderByCapabilityKey',
  // errors
  'isApiErrorResponse',
  'getApiErrorCode',
  'getApiErrorMessage',
  'getApiErrorDetails',
  'toApiErrorResponse',
  'API_ERROR_CODES',
  // constants
  'TEMPLATE_FILTER_KEYS',
  'TEMPLATE_STATUSES',
  'TEMPLATE_ORDER_BY_FIELDS',
  'TAG_FILTER_KEYS',
  'TAG_STATUSES',
  'TEMPLATE_PATHS',
  'TAG_PATHS',
  'DEFAULT_PAGE',
  'DEFAULT_PAGE_SIZE',
  'MAX_PAGE_SIZE',
  'MAX_TAGS_PER_REQUEST',
  'DEFAULT_MOST_RECENT_ACTIVE_VERSION',
] as const;

describe('package entry point', () => {
  it.each(EXPECTED_EXPORTS)('exports %s', (name) => {
    // Dynamic access is the point here: this walks the whole documented surface.
    // biome-ignore lint/performance/noDynamicNamespaceImportAccess: asserting the export list
    expect(pkg[name]).toBeDefined();
  });

  it('does not leak the Next.js binding into the framework-free entry point', () => {
    expect('useNextRouterAdapter' in pkg).toBe(false);
  });
});

describe('filter key lists', () => {
  it('has no duplicate template keys', () => {
    expect(new Set(pkg.TEMPLATE_FILTER_KEYS).size).toBe(pkg.TEMPLATE_FILTER_KEYS.length);
  });

  it('covers the narrowing template keys plus the sort keys', () => {
    expect([...pkg.TEMPLATE_NARROWING_FILTER_KEYS, ...pkg.TEMPLATE_SORT_KEYS].sort()).toEqual(
      [...pkg.TEMPLATE_FILTER_KEYS].sort(),
    );
  });

  it('matches the template statuses in the contract', () => {
    expect(pkg.TEMPLATE_STATUSES).toEqual(['draft', 'active', 'inactive', 'archived']);
  });

  it('matches the tag statuses in the contract, which are a narrower set', () => {
    expect(pkg.TAG_STATUSES).toEqual(['active', 'archived']);
  });

  it('matches the orderable fields in the contract', () => {
    expect(pkg.TEMPLATE_ORDER_BY_FIELDS).toEqual([
      'key',
      'name',
      'version',
      'status',
      'createdAt',
      'updatedAt',
    ]);
  });

  it('agrees with the server on the tag limit', () => {
    expect(pkg.MAX_TAGS_PER_REQUEST).toBe(50);
  });

  it('agrees with the server on the pagination bounds', () => {
    expect(pkg.DEFAULT_PAGE).toBe(1);
    expect(pkg.DEFAULT_PAGE_SIZE).toBe(20);
    expect(pkg.MAX_PAGE_SIZE).toBe(100);
  });
});

describe('invalidation path lists', () => {
  it('names every template-derived read path', () => {
    expect([...pkg.TEMPLATE_PATHS].sort()).toEqual([
      '/api/v1/templates',
      '/api/v1/templates/{key}',
      '/api/v1/templates/{key}/composition',
      '/api/v1/templates/{key}/status-history',
      '/api/v1/templates/{key}/versions',
      '/api/v1/templates/{key}/versions/{version}',
    ]);
  });

  it('names the tag read paths', () => {
    expect([...pkg.TAG_PATHS].sort()).toEqual(['/api/v1/tags', '/api/v1/tags/{slug}']);
  });
});
