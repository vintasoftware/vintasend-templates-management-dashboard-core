/**
 * Reading filters out of a URL and writing them back.
 *
 * A URL is user-editable, so nothing here trusts it: a value that is not a
 * legal member of its filter is dropped rather than forwarded, which keeps a
 * hand-typed `?status=nope` from turning into a 400. Pagination is clamped to
 * the bounds in `openapi.yaml` for the same reason.
 *
 * List filters are repeated parameters — `?status=draft&status=active` — which
 * is what the server's schema accepts and what `openapi-fetch` emits. A list
 * that ends up empty after validation is dropped entirely rather than sent as
 * a blank, because the server rejects a tag filter that names no tags.
 *
 * These are plain functions over `URLSearchParams`, usable on a server (a Next
 * `searchParams` object, an Express request) as well as in the browser.
 */

import type {
  TagFilters,
  TagListQuery,
  TagStatus,
  TemplateFilters,
  TemplateListQuery,
  TemplateOrderByField,
  TemplateOrderDirection,
  TemplateStatus,
} from '../api/types.js';
import {
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
  TEMPLATE_STATUSES,
  TEMPLATE_STRING_FILTER_KEYS,
  TEMPLATE_TAG_FILTER_KEYS,
} from './keys.js';

/**
 * Anything that can stand in for a query string. The record form is what a Next
 * server component receives as `searchParams`; a key holding an array becomes
 * repeated parameters, which is how the list filters travel.
 */
export type SearchParamsInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | string;

export type PaginationState = {
  /** 1-indexed, as on the wire. */
  page: number;
  pageSize: number;
};

export function toSearchParams(input: SearchParamsInput): URLSearchParams {
  if (input instanceof URLSearchParams) {
    return input;
  }

  if (typeof input === 'string') {
    return new URLSearchParams(input);
  }

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }

    // Every entry of an array becomes its own parameter, so a list filter
    // survives the trip through a record.
    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry);
    }
  }

  return params;
}

// --- readers ---------------------------------------------------------------

function readString(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();

  return value ? value : undefined;
}

function readEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = readString(params, key);

  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * A repeated parameter restricted to a fixed set. Members that are not legal
 * are dropped; if that leaves nothing, so is the filter.
 */
function readEnumList<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T[] | undefined {
  const values = params
    .getAll(key)
    .map((value) => value.trim())
    .filter((value): value is T => (allowed as readonly string[]).includes(value));

  const unique = [...new Set(values)];

  return unique.length > 0 ? unique : undefined;
}

/**
 * A repeated parameter holding free-text entries — tag slugs.
 *
 * Blanks are dropped rather than rejected, because a trailing comma in a tag
 * input is a UI artifact. A list that is nothing but blanks is dropped whole:
 * the caller asked to filter by tags and named none, and the server rejects
 * that rather than matching everything.
 */
function readStringList(params: URLSearchParams, key: string): string[] | undefined {
  const values = params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  const unique = [...new Set(values)].slice(0, MAX_TAGS_PER_REQUEST);

  return unique.length > 0 ? unique : undefined;
}

function readInteger(
  params: URLSearchParams,
  key: string,
  { min, max }: { min: number; max?: number },
): number | undefined {
  const raw = readString(params, key);

  if (raw === undefined) {
    return undefined;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < min) {
    return undefined;
  }

  return max !== undefined && value > max ? max : value;
}

/**
 * A boolean from text. `truthiness` is not usable here — the string `'false'`
 * is truthy, so `?mostRecentActiveVersion=false` would ask for exactly what the
 * caller meant to switch off. Anything unrecognised is dropped.
 */
function readBoolean(params: URLSearchParams, key: string): boolean | undefined {
  const raw = readString(params, key)?.toLowerCase();

  if (raw === 'true' || raw === '1') {
    return true;
  }

  if (raw === 'false' || raw === '0') {
    return false;
  }

  return undefined;
}

function readTimestamp(params: URLSearchParams, key: string): string | undefined {
  const value = readString(params, key);

  return value !== undefined && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

// --- template filters ------------------------------------------------------

/**
 * Reads every template filter the contract defines. Unknown parameters — a
 * UI's own tab or selection state, say — are ignored, so filters can share a
 * URL with them.
 *
 * A key absent from the URL is absent from the result: `mostRecentActiveVersion`
 * comes back `undefined` rather than `true`, meaning "let the server apply its
 * default". Use `DEFAULT_MOST_RECENT_ACTIVE_VERSION` to render the effective
 * value.
 */
export function parseTemplateFilters(input: SearchParamsInput): TemplateFilters {
  const params = toSearchParams(input);
  const filters: TemplateFilters = {};

  const status = readEnumList<TemplateStatus>(params, 'status', TEMPLATE_STATUSES);
  if (status !== undefined) {
    filters.status = status;
  }

  const orderByField = readEnum<TemplateOrderByField>(
    params,
    'orderByField',
    TEMPLATE_ORDER_BY_FIELDS,
  );
  if (orderByField !== undefined) {
    filters.orderByField = orderByField;
  }

  // A direction with no field is a 400 rather than an ignored parameter, so it
  // is only kept when there is something to order.
  const orderByDirection = readEnum<TemplateOrderDirection>(
    params,
    'orderByDirection',
    TEMPLATE_ORDER_DIRECTIONS,
  );
  if (orderByField !== undefined && orderByDirection !== undefined) {
    filters.orderByDirection = orderByDirection;
  }

  for (const key of TEMPLATE_STRING_FILTER_KEYS) {
    const value = readString(params, key);
    if (value !== undefined) {
      filters[key] = value;
    }
  }

  for (const key of TEMPLATE_NUMBER_FILTER_KEYS) {
    // The contract's `version` starts at 1; there is no version zero.
    const value = readInteger(params, key, { min: 1 });
    if (value !== undefined) {
      filters[key] = value;
    }
  }

  for (const key of TEMPLATE_DATE_FILTER_KEYS) {
    const value = readTimestamp(params, key);
    if (value !== undefined) {
      filters[key] = value;
    }
  }

  for (const key of TEMPLATE_TAG_FILTER_KEYS) {
    const value = readStringList(params, key);
    if (value !== undefined) {
      filters[key] = value;
    }
  }

  for (const key of TEMPLATE_BOOLEAN_FILTER_KEYS) {
    const value = readBoolean(params, key);
    if (value !== undefined) {
      filters[key] = value;
    }
  }

  return filters;
}

/** Reads every tag filter the contract defines. */
export function parseTagFilters(input: SearchParamsInput): TagFilters {
  const params = toSearchParams(input);
  const filters: TagFilters = {};

  const status = readEnumList<TagStatus>(params, 'status', TAG_STATUSES);
  if (status !== undefined) {
    filters.status = status;
  }

  for (const key of TAG_STRING_FILTER_KEYS) {
    const value = readString(params, key);
    if (value !== undefined) {
      filters[key] = value;
    }
  }

  return filters;
}

// --- pagination ------------------------------------------------------------

/**
 * Reads `page` and `pageSize`, falling back to the defaults and clamping
 * `pageSize` to the range the API accepts.
 */
export function parsePagination(
  input: SearchParamsInput,
  defaults: Partial<PaginationState> = {},
): PaginationState {
  const params = toSearchParams(input);

  return {
    page: readInteger(params, 'page', { min: 1 }) ?? defaults.page ?? DEFAULT_PAGE,
    pageSize:
      readInteger(params, 'pageSize', { min: MIN_PAGE_SIZE, max: MAX_PAGE_SIZE }) ??
      defaults.pageSize ??
      DEFAULT_PAGE_SIZE,
  };
}

/** Template filters and pagination together, in the shape the endpoint expects. */
export function parseTemplateListQuery(
  input: SearchParamsInput,
  defaults: Partial<PaginationState> = {},
): TemplateListQuery {
  return { ...parseTemplateFilters(input), ...parsePagination(input, defaults) };
}

/** Tag filters and pagination together. */
export function parseTagListQuery(
  input: SearchParamsInput,
  defaults: Partial<PaginationState> = {},
): TagListQuery {
  return { ...parseTagFilters(input), ...parsePagination(input, defaults) };
}

// --- writing ---------------------------------------------------------------

function writeValue(params: URLSearchParams, key: string, value: unknown): void {
  params.delete(key);

  if (value === undefined || value === null || value === '') {
    return;
  }

  if (Array.isArray(value)) {
    // An empty list is not "match nothing" to this API — it is a 400 — so it is
    // written as no parameter at all.
    for (const entry of value.slice(0, MAX_TAGS_PER_REQUEST)) {
      params.append(key, String(entry));
    }

    return;
  }

  params.set(key, String(value));
}

function applyFilters<Filters extends object>(
  params: URLSearchParams,
  filters: Filters,
  keys: readonly (keyof Filters & string)[],
  pagination?: Partial<PaginationState>,
): URLSearchParams {
  const next = new URLSearchParams(params);

  for (const key of keys) {
    writeValue(next, key, filters[key]);
  }

  if (pagination?.page !== undefined) {
    next.set('page', String(pagination.page));
  }

  if (pagination?.pageSize !== undefined) {
    next.set('pageSize', String(pagination.pageSize));
  }

  return next;
}

/**
 * Writes template filters onto a copy of `params`, deleting the keys that are
 * unset. Copying rather than mutating keeps this safe to call with the object a
 * router handed you, and leaving unrelated parameters in place means a filter
 * change does not clobber the rest of the URL.
 */
export function applyTemplateFilters(
  params: URLSearchParams,
  filters: TemplateFilters,
  pagination?: Partial<PaginationState>,
): URLSearchParams {
  return applyFilters(params, filters, TEMPLATE_FILTER_KEYS, pagination);
}

/** Writes tag filters onto a copy of `params`. */
export function applyTagFilters(
  params: URLSearchParams,
  filters: TagFilters,
  pagination?: Partial<PaginationState>,
): URLSearchParams {
  return applyFilters(params, filters, TAG_FILTER_KEYS, pagination);
}

/**
 * The query string for a set of template filters on its own, with no other
 * parameters. Keys are sorted so the same filters always produce the same
 * string — handy for cache keys and for asserting on URLs in tests.
 *
 * The sort is by key and is stable, so members of a list keep the order they
 * were given: two filters that differ only in list order serialise differently
 * even though the API treats them the same.
 */
export function serializeTemplateFilters(
  filters: TemplateFilters,
  pagination?: Partial<PaginationState>,
): string {
  const params = applyTemplateFilters(new URLSearchParams(), filters, pagination);

  params.sort();

  return params.toString();
}

/** The query string for a set of tag filters on its own. */
export function serializeTagFilters(
  filters: TagFilters,
  pagination?: Partial<PaginationState>,
): string {
  const params = applyTagFilters(new URLSearchParams(), filters, pagination);

  params.sort();

  return params.toString();
}

// --- inspecting ------------------------------------------------------------

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function prune<Filters extends object>(
  filters: Filters,
  keys: readonly (keyof Filters & string)[],
): Filters {
  const pruned = {} as Filters;

  for (const key of keys) {
    const value = filters[key];

    if (!isEmptyValue(value)) {
      pruned[key] = value;
    }
  }

  return pruned;
}

/** Drops unset and empty values, so `{ status: [] }` does not become `?status=`. */
export function pruneTemplateFilters(filters: TemplateFilters): TemplateFilters {
  return prune(filters, TEMPLATE_FILTER_KEYS);
}

/** Drops unset and empty values from tag filters. */
export function pruneTagFilters(filters: TagFilters): TagFilters {
  return prune(filters, TAG_FILTER_KEYS);
}

/**
 * True when at least one narrowing template filter is set.
 *
 * Ordering does not count: a sorted-but-unfiltered list is still the full list.
 * Neither does `mostRecentActiveVersion` at its default — that is the normal
 * one-row-per-key view, not something the user narrowed to.
 */
export function hasActiveTemplateFilters(filters: TemplateFilters): boolean {
  return TEMPLATE_NARROWING_FILTER_KEYS.some((key) => {
    const value = filters[key];

    if (key === 'mostRecentActiveVersion' && value === DEFAULT_MOST_RECENT_ACTIVE_VERSION) {
      return false;
    }

    return !isEmptyValue(value);
  });
}

/** True when at least one tag filter is set. */
export function hasActiveTagFilters(filters: TagFilters): boolean {
  return TAG_FILTER_KEYS.some((key) => !isEmptyValue(filters[key]));
}
