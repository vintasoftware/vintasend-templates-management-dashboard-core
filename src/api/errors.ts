/**
 * Error helpers.
 *
 * `openapi-react-query` rejects a query with whatever the API put in the
 * response body, so a failed call surfaces the contract's `ApiErrorResponse`
 * envelope as-is — accurately typed, but awkward to branch on. These helpers
 * narrow that shape, and normalise the other things a fetch can reject with
 * (a network failure, an HTML error page from a proxy) into the same envelope.
 */

import type { ApiErrorCode, ErrorResponse } from './types.js';

/**
 * Every code the contract defines. Two are specific to template management and
 * worth handling on their own: `INVALID_STATUS_TRANSITION` when a lifecycle
 * move is not allowed from the current status, and
 * `TEMPLATE_COMPOSITION_ERROR` when a template's inheritance chain cannot be
 * resolved.
 */
export const API_ERROR_CODES = [
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATUS_TRANSITION',
  'PREVIEW_UNAVAILABLE',
  'TEMPLATE_COMPOSITION_ERROR',
  'INTERNAL_ERROR',
] as const satisfies readonly ApiErrorCode[];

/**
 * Compile-time proof that the list above covers the contract. A code added to
 * `openapi.yaml` fails this until it is listed.
 */
type AssertNever<T extends never> = T;
export type UncoveredErrorCode = AssertNever<
  Exclude<ApiErrorCode, (typeof API_ERROR_CODES)[number]>
>;

/**
 * True when `value` is the API's error envelope. Use it to narrow the `error`
 * a query or mutation rejected with before reading `code`.
 */
export function isApiErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }

  const inner = (value as { error: unknown }).error;

  return (
    typeof inner === 'object' &&
    inner !== null &&
    'code' in inner &&
    'message' in inner &&
    typeof (inner as { message: unknown }).message === 'string' &&
    (API_ERROR_CODES as readonly string[]).includes((inner as { code: string }).code)
  );
}

/**
 * The machine-readable code behind a failure, or `undefined` when it did not
 * come from the API (a dropped connection, a CORS rejection, a proxy timeout).
 * Branch on this rather than on message text.
 */
export function getApiErrorCode(error: unknown): ApiErrorCode | undefined {
  return isApiErrorResponse(error) ? error.error.code : undefined;
}

/** A message worth showing a user, for any rejection reason. */
export function getApiErrorMessage(error: unknown): string {
  if (isApiErrorResponse(error)) {
    return error.error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'The templates management API request failed.';
}

/**
 * Machine-readable context the API attached to a failure — which field failed
 * validation, which transition was refused. Shape depends on the code.
 */
export function getApiErrorDetails(error: unknown): unknown {
  return isApiErrorResponse(error) ? error.error.details : undefined;
}

/**
 * Coerces any rejection into the contract's envelope, so UI code has one shape
 * to render. A non-API failure becomes `INTERNAL_ERROR`, which is the closest
 * code this contract offers for a transport-level problem — unlike the
 * notifications API, it has no `UPSTREAM_ERROR`.
 */
export function toApiErrorResponse(error: unknown): ErrorResponse {
  if (isApiErrorResponse(error)) {
    return error;
  }

  return {
    error: { code: 'INTERNAL_ERROR', message: getApiErrorMessage(error) },
  };
}
