/**
 * Reading the backend's capability report.
 *
 * `GET /api/v1/capabilities` returns flat dotted keys, and the two namespaces
 * have **opposite defaults**. Getting this backwards is the easy mistake here,
 * so filters and ordering get separate functions rather than one shared
 * `supportsCapability`:
 *
 *   * `fields.*`, `stringLookups.*`, `logical.*` — a missing key means
 *     **supported**. Backends declare only what they cannot do, so a capability
 *     added in a later release does not force every backend to re-declare it.
 *     An unsupported filter is dropped by the server, and the response simply
 *     contains more rows than were asked for.
 *
 *   * `orderBy.*` — a missing key means **not supported**. The API publishes
 *     one for every orderable field, and asking for a field the backend cannot
 *     sort by is a **400**, not an unordered page. That asymmetry is
 *     deliberate: a dropped filter is visible in the response, whereas a
 *     dropped sort returns the right rows in an arbitrary sequence under a
 *     column header claiming otherwise.
 */

import type { FilterCapabilities, TemplateOrderByField } from '../api/types.js';
import { TEMPLATE_ORDER_BY_FIELDS } from '../filters/keys.js';

/** The capability key guarding ordering by `field`. */
export function orderByCapabilityKey(field: TemplateOrderByField): string {
  return `orderBy.${field}`;
}

/**
 * Reads a filter capability, defaulting to supported.
 *
 * Use for `fields.*`, `stringLookups.*` and `logical.*`. Not for `orderBy.*` —
 * see `supportsOrdering`.
 */
export function supportsFilter(capabilities: FilterCapabilities | undefined, key: string): boolean {
  return capabilities?.[key] ?? true;
}

/**
 * Whether the backend can sort by `field`, defaulting to **not** supported.
 *
 * Gate every sortable column on this. While the capabilities are still loading
 * it answers `false`, so a column cannot become clickable before its support is
 * known and provoke a 400 on the first click.
 */
export function supportsOrdering(
  capabilities: FilterCapabilities | undefined,
  field: TemplateOrderByField,
): boolean {
  return capabilities?.[orderByCapabilityKey(field)] ?? false;
}

/**
 * The fields this backend can sort by, in contract order. Build sortable
 * columns from this rather than from `TEMPLATE_ORDER_BY_FIELDS`, which is every
 * field the *contract* defines regardless of backend.
 */
export function orderableFields(
  capabilities: FilterCapabilities | undefined,
): TemplateOrderByField[] {
  return TEMPLATE_ORDER_BY_FIELDS.filter((field) => supportsOrdering(capabilities, field));
}
