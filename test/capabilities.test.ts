import { describe, expect, it } from 'vitest';
import {
  orderableFields,
  orderByCapabilityKey,
  supportsFilter,
  supportsOrdering,
} from '../src/hooks/capabilities.js';

/**
 * The two namespaces have opposite defaults, and getting them the wrong way
 * round is the easy mistake with this contract — a filter wrongly assumed
 * unsupported hides an affordance, while an order wrongly assumed supported
 * produces a 400 on click.
 */
describe('supportsFilter', () => {
  it('treats an absent key as supported', () => {
    expect(supportsFilter({ 'fields.status': false }, 'fields.isAbstract')).toBe(true);
  });

  it('reports an explicitly unsupported filter', () => {
    expect(supportsFilter({ 'fields.status': false }, 'fields.status')).toBe(false);
  });

  it('reports an explicitly supported filter', () => {
    expect(supportsFilter({ 'stringLookups.includes': true }, 'stringLookups.includes')).toBe(true);
  });

  it('assumes support before the capabilities have loaded', () => {
    expect(supportsFilter(undefined, 'fields.status')).toBe(true);
  });
});

describe('supportsOrdering', () => {
  it('treats an absent key as NOT supported, unlike a filter', () => {
    expect(supportsOrdering({}, 'name')).toBe(false);
  });

  it('reports an explicitly supported field', () => {
    expect(supportsOrdering({ 'orderBy.name': true }, 'name')).toBe(true);
  });

  it('reports an explicitly unsupported field', () => {
    expect(supportsOrdering({ 'orderBy.name': false }, 'name')).toBe(false);
  });

  it('is false while the capabilities are still loading, so a column cannot go live early', () => {
    expect(supportsOrdering(undefined, 'name')).toBe(false);
  });

  it('does not confuse one field for another', () => {
    const capabilities = { 'orderBy.name': true };

    expect(supportsOrdering(capabilities, 'name')).toBe(true);
    expect(supportsOrdering(capabilities, 'key')).toBe(false);
  });
});

describe('orderByCapabilityKey', () => {
  it('builds the dotted key the API publishes', () => {
    expect(orderByCapabilityKey('createdAt')).toBe('orderBy.createdAt');
  });
});

describe('orderableFields', () => {
  it('is empty when the backend can sort by nothing', () => {
    expect(orderableFields({})).toEqual([]);
  });

  it('is empty before the capabilities have loaded', () => {
    expect(orderableFields(undefined)).toEqual([]);
  });

  it('lists only the fields the backend declares', () => {
    expect(orderableFields({ 'orderBy.name': true, 'orderBy.createdAt': true })).toEqual([
      'name',
      'createdAt',
    ]);
  });

  it('excludes a field the backend explicitly cannot sort by', () => {
    expect(
      orderableFields({ 'orderBy.name': true, 'orderBy.key': false, 'orderBy.version': true }),
    ).toEqual(['name', 'version']);
  });

  it('returns fields in contract order rather than capability-map order', () => {
    expect(
      orderableFields({ 'orderBy.updatedAt': true, 'orderBy.key': true, 'orderBy.name': true }),
    ).toEqual(['key', 'name', 'updatedAt']);
  });

  it('ignores capability keys from other namespaces', () => {
    expect(orderableFields({ 'fields.status': true, 'orderBy.key': true })).toEqual(['key']);
  });
});
