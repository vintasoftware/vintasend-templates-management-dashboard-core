import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  getApiErrorCode,
  getApiErrorDetails,
  getApiErrorMessage,
  isApiErrorResponse,
  toApiErrorResponse,
} from '../src/api/errors.js';

const notFound = { error: { code: 'NOT_FOUND', message: 'No such template.' } };

describe('API_ERROR_CODES', () => {
  it('covers the codes this contract adds over the notifications one', () => {
    expect(API_ERROR_CODES).toContain('INVALID_STATUS_TRANSITION');
    expect(API_ERROR_CODES).toContain('TEMPLATE_COMPOSITION_ERROR');
  });

  it('does not carry codes this contract has no notion of', () => {
    expect(API_ERROR_CODES).not.toContain('UPSTREAM_ERROR');
  });
});

describe('isApiErrorResponse', () => {
  it('accepts the contract envelope', () => {
    expect(isApiErrorResponse(notFound)).toBe(true);
  });

  it('accepts a lifecycle failure', () => {
    expect(
      isApiErrorResponse({
        error: { code: 'INVALID_STATUS_TRANSITION', message: 'archived cannot become draft.' },
      }),
    ).toBe(true);
  });

  it('accepts an envelope carrying details', () => {
    expect(
      isApiErrorResponse({
        error: { code: 'BAD_REQUEST', message: 'Invalid.', details: { field: 'status' } },
      }),
    ).toBe(true);
  });

  it('rejects an unknown error code', () => {
    expect(isApiErrorResponse({ error: { code: 'TEAPOT', message: 'no' } })).toBe(false);
  });

  it('rejects a code from the notifications contract that this one lacks', () => {
    expect(isApiErrorResponse({ error: { code: 'UPSTREAM_ERROR', message: 'no' } })).toBe(false);
  });

  it('rejects an envelope with a non-string message', () => {
    expect(isApiErrorResponse({ error: { code: 'NOT_FOUND', message: 404 } })).toBe(false);
  });

  it('rejects a bare Error', () => {
    expect(isApiErrorResponse(new Error('network down'))).toBe(false);
  });

  it('rejects null', () => {
    expect(isApiErrorResponse(null)).toBe(false);
  });

  it('rejects an object with no error key', () => {
    expect(isApiErrorResponse({ code: 'NOT_FOUND', message: 'x' })).toBe(false);
  });
});

describe('getApiErrorCode', () => {
  it('reads the code off an API failure', () => {
    expect(getApiErrorCode(notFound)).toBe('NOT_FOUND');
  });

  it('is undefined for a transport failure', () => {
    expect(getApiErrorCode(new TypeError('Failed to fetch'))).toBeUndefined();
  });
});

describe('getApiErrorMessage', () => {
  it('prefers the API message', () => {
    expect(getApiErrorMessage(notFound)).toBe('No such template.');
  });

  it('falls back to an Error message', () => {
    expect(getApiErrorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch');
  });

  it('has a last resort for a thrown non-Error', () => {
    expect(getApiErrorMessage('something')).toBe('The templates management API request failed.');
  });
});

describe('getApiErrorDetails', () => {
  it('returns the details the API attached', () => {
    expect(
      getApiErrorDetails({
        error: { code: 'BAD_REQUEST', message: 'Invalid.', details: { field: 'status' } },
      }),
    ).toEqual({ field: 'status' });
  });

  it('is undefined when there are none', () => {
    expect(getApiErrorDetails(notFound)).toBeUndefined();
  });

  it('is undefined for a transport failure', () => {
    expect(getApiErrorDetails(new Error('boom'))).toBeUndefined();
  });
});

describe('toApiErrorResponse', () => {
  it('passes an API failure through unchanged', () => {
    expect(toApiErrorResponse(notFound)).toBe(notFound);
  });

  it('wraps a transport failure as INTERNAL_ERROR, the closest code this contract has', () => {
    expect(toApiErrorResponse(new Error('socket hang up'))).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'socket hang up' },
    });
  });
});
