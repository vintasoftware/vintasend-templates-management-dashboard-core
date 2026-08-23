/**
 * The filter vocabulary, grouped by how each key is parsed out of a URL.
 *
 * Every list is checked against the generated query types, so a parameter added
 * to `openapi.yaml` and left out here becomes a compile error rather than a
 * filter that silently never reaches the API.
 *
 * This contract filters on more shapes than a flat string map: `status` and the
 * two tag filters are repeated query parameters, and two flags are booleans
 * that must survive a round trip through text — which is why the groups below
 * are typed separately rather than lumped together.
 */

import type {
  TagFilters,
  TagStatus,
  TemplateFilters,
  TemplateOrderByField,
  TemplateOrderDirection,
  TemplateStatus,
} from '../api/types.js';

type TemplateFilterKey = keyof TemplateFilters;
type TagFilterKey = keyof TagFilters;

export const TEMPLATE_STATUSES = [
  'draft',
  'active',
  'inactive',
  'archived',
] as const satisfies readonly TemplateStatus[];

export const TAG_STATUSES = ['active', 'archived'] as const satisfies readonly TagStatus[];

/**
 * Fields the API can be asked to order by.
 *
 * Which of these a given backend actually supports is published under
 * `orderBy.*` in `GET /api/v1/capabilities`, and asking for an unsupported one
 * is a **400, not a silent drop**. Build sortable columns from the
 * capabilities, never from this list — see `supportsOrdering`.
 */
export const TEMPLATE_ORDER_BY_FIELDS = [
  'key',
  'name',
  'version',
  'status',
  'createdAt',
  'updatedAt',
] as const satisfies readonly TemplateOrderByField[];

export const TEMPLATE_ORDER_DIRECTIONS = [
  'asc',
  'desc',
] as const satisfies readonly TemplateOrderDirection[];

// --- template filters ------------------------------------------------------

/** Free-text filters, matched by the most precise lookup the backend supports. */
export const TEMPLATE_STRING_FILTER_KEYS = [
  'key',
  'name',
  'description',
  'templateManagedBackend',
] as const satisfies readonly TemplateFilterKey[];

/** Positive integers. */
export const TEMPLATE_NUMBER_FILTER_KEYS = [
  'version',
] as const satisfies readonly TemplateFilterKey[];

/** ISO-8601 range bounds. */
export const TEMPLATE_DATE_FILTER_KEYS = [
  'createdAtFrom',
  'createdAtTo',
  'updatedAtFrom',
  'updatedAtTo',
] as const satisfies readonly TemplateFilterKey[];

/**
 * Repeated query parameters holding a list of tag slugs. `includesAllTags`
 * requires every tag; `includesAnyOfTags` requires at least one.
 */
export const TEMPLATE_TAG_FILTER_KEYS = [
  'includesAllTags',
  'includesAnyOfTags',
] as const satisfies readonly TemplateFilterKey[];

/**
 * Booleans. `mostRecentActiveVersion` defaults to `true` server-side: a row in
 * the store is a *version*, so without it a key appears once per version it has
 * ever had.
 */
export const TEMPLATE_BOOLEAN_FILTER_KEYS = [
  'mostRecentActiveVersion',
  'isAbstract',
] as const satisfies readonly TemplateFilterKey[];

/** Ordering travels with the filters but narrows nothing. */
export const TEMPLATE_SORT_KEYS = [
  'orderByField',
  'orderByDirection',
] as const satisfies readonly TemplateFilterKey[];

/** The narrowing template keys — everything except ordering. */
export const TEMPLATE_NARROWING_FILTER_KEYS = [
  'status',
  ...TEMPLATE_STRING_FILTER_KEYS,
  ...TEMPLATE_NUMBER_FILTER_KEYS,
  ...TEMPLATE_DATE_FILTER_KEYS,
  ...TEMPLATE_TAG_FILTER_KEYS,
  ...TEMPLATE_BOOLEAN_FILTER_KEYS,
] as const satisfies readonly TemplateFilterKey[];

/** Every template key the URL carries. */
export const TEMPLATE_FILTER_KEYS = [
  ...TEMPLATE_NARROWING_FILTER_KEYS,
  ...TEMPLATE_SORT_KEYS,
] as const satisfies readonly TemplateFilterKey[];

// --- tag filters -----------------------------------------------------------

export const TAG_STRING_FILTER_KEYS = [
  'search',
  'tenant',
] as const satisfies readonly TagFilterKey[];

/** Every tag key the URL carries. `status` is a repeated parameter. */
export const TAG_FILTER_KEYS = [
  'status',
  ...TAG_STRING_FILTER_KEYS,
] as const satisfies readonly TagFilterKey[];

// --- limits ----------------------------------------------------------------

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

/** `pageSize` bounds from `openapi.yaml`. Values outside are clamped, not rejected. */
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;

/**
 * The server rejects a tag filter longer than this, because each tag is a term
 * the backend has to match. Longer lists are truncated rather than sent.
 */
export const MAX_TAGS_PER_REQUEST = 50;

/**
 * Server-side default of `mostRecentActiveVersion`: one row per key, its
 * current version. The URL omits the parameter when it holds this value.
 */
export const DEFAULT_MOST_RECENT_ACTIVE_VERSION = true;

// --- exhaustiveness --------------------------------------------------------

/**
 * Compile-time proof that the lists above cover the generated query types. If
 * `openapi.yaml` grows a filter, the aliases below stop satisfying their
 * `never` constraint and this file fails to type-check until the new key is
 * added to one of the groups.
 */
type AssertNever<T extends never> = T;

export type UncoveredTemplateFilterKey = AssertNever<
  Exclude<TemplateFilterKey, (typeof TEMPLATE_FILTER_KEYS)[number]>
>;

export type UncoveredTagFilterKey = AssertNever<
  Exclude<TagFilterKey, (typeof TAG_FILTER_KEYS)[number]>
>;
