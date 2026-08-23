import { describe, expect, it } from 'vitest';
import type { TagFilters, TemplateFilters } from '../src/api/types.js';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_TAGS_PER_REQUEST,
} from '../src/filters/keys.js';
import {
  applyTagFilters,
  applyTemplateFilters,
  hasActiveTagFilters,
  hasActiveTemplateFilters,
  parsePagination,
  parseTagFilters,
  parseTagListQuery,
  parseTemplateFilters,
  parseTemplateListQuery,
  pruneTagFilters,
  pruneTemplateFilters,
  serializeTagFilters,
  serializeTemplateFilters,
  toSearchParams,
} from '../src/filters/parse.js';

describe('toSearchParams', () => {
  it('passes a URLSearchParams through untouched', () => {
    const params = new URLSearchParams('status=draft');

    expect(toSearchParams(params)).toBe(params);
  });

  it('parses a raw query string', () => {
    expect(toSearchParams('?name=welcome&page=2').get('name')).toBe('welcome');
  });

  it('reads a Next-style searchParams record', () => {
    const params = toSearchParams({ name: 'welcome', page: '3', missing: undefined });

    expect(params.get('name')).toBe('welcome');
    expect(params.get('page')).toBe('3');
    expect(params.has('missing')).toBe(false);
  });

  it('expands an array into repeated parameters, so a list filter survives', () => {
    const params = toSearchParams({ status: ['draft', 'active'] });

    expect(params.getAll('status')).toEqual(['draft', 'active']);
  });

  it('ignores an empty array', () => {
    expect(toSearchParams({ status: [] }).has('status')).toBe(false);
  });
});

describe('parseTemplateFilters', () => {
  it('reads every kind of filter', () => {
    const filters = parseTemplateFilters(
      'key=welcome&name=Welcome&description=greeting&templateManagedBackend=db' +
        '&version=3&status=draft&status=active' +
        '&createdAtFrom=2026-01-01T00:00:00.000Z&createdAtTo=2026-02-01T00:00:00.000Z' +
        '&updatedAtFrom=2026-01-15T00:00:00.000Z&updatedAtTo=2026-01-20T00:00:00.000Z' +
        '&includesAllTags=marketing&includesAllTags=urgent&includesAnyOfTags=beta' +
        '&mostRecentActiveVersion=false&isAbstract=true' +
        '&orderByField=name&orderByDirection=asc',
    );

    expect(filters).toEqual({
      key: 'welcome',
      name: 'Welcome',
      description: 'greeting',
      templateManagedBackend: 'db',
      version: 3,
      status: ['draft', 'active'],
      createdAtFrom: '2026-01-01T00:00:00.000Z',
      createdAtTo: '2026-02-01T00:00:00.000Z',
      updatedAtFrom: '2026-01-15T00:00:00.000Z',
      updatedAtTo: '2026-01-20T00:00:00.000Z',
      includesAllTags: ['marketing', 'urgent'],
      includesAnyOfTags: ['beta'],
      mostRecentActiveVersion: false,
      isAbstract: true,
      orderByField: 'name',
      orderByDirection: 'asc',
    });
  });

  it('returns nothing for an empty query string', () => {
    expect(parseTemplateFilters('')).toEqual({});
  });

  it('leaves mostRecentActiveVersion unset rather than filling in the server default', () => {
    // Absent means "let the server apply its default", which keeps the URL and
    // the parsed state saying the same thing.
    expect(parseTemplateFilters('')).not.toHaveProperty('mostRecentActiveVersion');
  });

  it('ignores parameters that are not filters', () => {
    expect(parseTemplateFilters('tab=drafts&selected=abc&page=4')).toEqual({});
  });

  describe('status list', () => {
    it('reads a single status as a one-entry list', () => {
      expect(parseTemplateFilters('status=draft').status).toEqual(['draft']);
    });

    it('drops members that are not in the contract but keeps the rest', () => {
      expect(parseTemplateFilters('status=draft&status=nope&status=active').status).toEqual([
        'draft',
        'active',
      ]);
    });

    it('drops the whole filter when no member survives', () => {
      expect(parseTemplateFilters('status=nope')).toEqual({});
    });

    it('de-duplicates repeated members', () => {
      expect(parseTemplateFilters('status=draft&status=draft').status).toEqual(['draft']);
    });

    it('is case-sensitive, since the API is', () => {
      expect(parseTemplateFilters('status=DRAFT')).toEqual({});
    });
  });

  describe('tag lists', () => {
    it('reads repeated parameters', () => {
      expect(parseTemplateFilters('includesAllTags=a&includesAllTags=b').includesAllTags).toEqual([
        'a',
        'b',
      ]);
    });

    it('also accepts a comma-separated list, as a tag input produces', () => {
      expect(parseTemplateFilters('includesAnyOfTags=a,b,c').includesAnyOfTags).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('trims entries and drops blanks left by a trailing comma', () => {
      expect(parseTemplateFilters('includesAllTags=a,%20b%20,').includesAllTags).toEqual([
        'a',
        'b',
      ]);
    });

    it('drops a list that is nothing but blanks, which the server rejects', () => {
      expect(parseTemplateFilters('includesAllTags=%20,%20')).toEqual({});
    });

    it('de-duplicates', () => {
      expect(parseTemplateFilters('includesAllTags=a&includesAllTags=a').includesAllTags).toEqual([
        'a',
      ]);
    });

    it('truncates to the limit the server accepts', () => {
      const tags = Array.from({ length: 60 }, (_, index) => `tag-${index}`);

      expect(
        parseTemplateFilters(`includesAllTags=${tags.join(',')}`).includesAllTags,
      ).toHaveLength(MAX_TAGS_PER_REQUEST);
    });
  });

  describe('booleans', () => {
    it('reads true', () => {
      expect(parseTemplateFilters('isAbstract=true').isAbstract).toBe(true);
    });

    it('reads false rather than treating the string as truthy', () => {
      expect(parseTemplateFilters('isAbstract=false').isAbstract).toBe(false);
    });

    it('accepts 1 and 0', () => {
      expect(parseTemplateFilters('isAbstract=1').isAbstract).toBe(true);
      expect(parseTemplateFilters('isAbstract=0').isAbstract).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(parseTemplateFilters('isAbstract=TRUE').isAbstract).toBe(true);
    });

    it('drops anything it does not recognise', () => {
      expect(parseTemplateFilters('isAbstract=yes')).toEqual({});
    });
  });

  describe('version', () => {
    it('reads a positive integer', () => {
      expect(parseTemplateFilters('version=2').version).toBe(2);
    });

    it('drops version zero, which this contract has no notion of', () => {
      expect(parseTemplateFilters('version=0')).toEqual({});
    });

    it('drops a negative version', () => {
      expect(parseTemplateFilters('version=-1')).toEqual({});
    });

    it('drops a fractional version', () => {
      expect(parseTemplateFilters('version=1.5')).toEqual({});
    });

    it('drops a non-numeric version', () => {
      expect(parseTemplateFilters('version=latest')).toEqual({});
    });
  });

  describe('ordering', () => {
    it('reads a field and direction', () => {
      expect(parseTemplateFilters('orderByField=name&orderByDirection=desc')).toEqual({
        orderByField: 'name',
        orderByDirection: 'desc',
      });
    });

    it('drops a field that is not orderable in the contract', () => {
      expect(parseTemplateFilters('orderByField=bodyTemplate')).toEqual({});
    });

    it('drops a direction with no field, which the server answers 400 to', () => {
      expect(parseTemplateFilters('orderByDirection=asc')).toEqual({});
    });

    it('drops an unrecognised direction but keeps the field', () => {
      expect(parseTemplateFilters('orderByField=name&orderByDirection=sideways')).toEqual({
        orderByField: 'name',
      });
    });
  });

  describe('strings and dates', () => {
    it('trims a string filter', () => {
      expect(parseTemplateFilters('name=%20welcome%20').name).toBe('welcome');
    });

    it('drops a whitespace-only string filter', () => {
      expect(parseTemplateFilters('name=%20%20')).toEqual({});
    });

    it('drops an unparseable timestamp', () => {
      expect(parseTemplateFilters('createdAtFrom=yesterday')).toEqual({});
    });

    it('accepts a date-only timestamp', () => {
      expect(parseTemplateFilters('createdAtFrom=2026-01-01').createdAtFrom).toBe('2026-01-01');
    });
  });
});

describe('parseTagFilters', () => {
  it('reads every tag filter', () => {
    expect(parseTagFilters('status=active&status=archived&search=promo&tenant=acme')).toEqual({
      status: ['active', 'archived'],
      search: 'promo',
      tenant: 'acme',
    });
  });

  it('rejects a template status that is not a tag status', () => {
    expect(parseTagFilters('status=draft')).toEqual({});
  });

  it('returns nothing for an empty query string', () => {
    expect(parseTagFilters('')).toEqual({});
  });
});

describe('parsePagination', () => {
  it('falls back to the defaults when the URL says nothing', () => {
    expect(parsePagination('')).toEqual({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('reads page and pageSize from the URL', () => {
    expect(parsePagination('page=4&pageSize=50')).toEqual({ page: 4, pageSize: 50 });
  });

  it('clamps pageSize down to the contract maximum', () => {
    expect(parsePagination('pageSize=5000').pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('falls back when pageSize is below the minimum', () => {
    expect(parsePagination('pageSize=0').pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it('falls back when page is zero, since the API is 1-indexed', () => {
    expect(parsePagination('page=0').page).toBe(DEFAULT_PAGE);
  });

  it('honours caller-supplied defaults', () => {
    expect(parsePagination('', { page: 2, pageSize: 25 })).toEqual({ page: 2, pageSize: 25 });
  });
});

describe('list queries', () => {
  it('merges template filters and pagination', () => {
    expect(parseTemplateListQuery('status=draft&page=2&pageSize=10')).toEqual({
      status: ['draft'],
      page: 2,
      pageSize: 10,
    });
  });

  it('merges tag filters and pagination', () => {
    expect(parseTagListQuery('search=promo&page=3')).toEqual({
      search: 'promo',
      page: 3,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });
});

describe('applyTemplateFilters', () => {
  it('writes set filters and deletes unset ones', () => {
    const next = applyTemplateFilters(new URLSearchParams('name=old&tenant=acme'), {
      name: 'new',
    });

    expect(next.get('name')).toBe('new');
    expect(next.has('description')).toBe(false);
  });

  it('does not mutate the params it was given', () => {
    const existing = new URLSearchParams('name=old');

    applyTemplateFilters(existing, { name: 'new' });

    expect(existing.get('name')).toBe('old');
  });

  it('leaves parameters it does not own alone', () => {
    const next = applyTemplateFilters(new URLSearchParams('tab=drafts'), { name: 'x' });

    expect(next.get('tab')).toBe('drafts');
  });

  it('writes a list as repeated parameters', () => {
    const next = applyTemplateFilters(new URLSearchParams(), { status: ['draft', 'active'] });

    expect(next.getAll('status')).toEqual(['draft', 'active']);
  });

  it('replaces a list rather than appending to it', () => {
    const next = applyTemplateFilters(new URLSearchParams('status=draft&status=active'), {
      status: ['archived'],
    });

    expect(next.getAll('status')).toEqual(['archived']);
  });

  it('writes no parameter for an empty list, which the server would answer 400 to', () => {
    const next = applyTemplateFilters(new URLSearchParams('status=draft'), { status: [] });

    expect(next.has('status')).toBe(false);
  });

  it('truncates a list to the server limit', () => {
    const tags = Array.from({ length: 60 }, (_, index) => `tag-${index}`);

    const next = applyTemplateFilters(new URLSearchParams(), { includesAllTags: tags });

    expect(next.getAll('includesAllTags')).toHaveLength(MAX_TAGS_PER_REQUEST);
  });

  it('writes false rather than dropping it', () => {
    const next = applyTemplateFilters(new URLSearchParams(), { mostRecentActiveVersion: false });

    expect(next.get('mostRecentActiveVersion')).toBe('false');
  });

  it('writes pagination when it is supplied', () => {
    const next = applyTemplateFilters(new URLSearchParams(), {}, { page: 3, pageSize: 50 });

    expect(next.get('page')).toBe('3');
    expect(next.get('pageSize')).toBe('50');
  });

  it('round-trips through parseTemplateFilters', () => {
    const filters: TemplateFilters = {
      key: 'welcome',
      status: ['draft', 'active'],
      version: 2,
      includesAllTags: ['a', 'b'],
      isAbstract: false,
      mostRecentActiveVersion: false,
      createdAtFrom: '2026-03-01T00:00:00.000Z',
      orderByField: 'createdAt',
      orderByDirection: 'desc',
    };

    expect(parseTemplateFilters(applyTemplateFilters(new URLSearchParams(), filters))).toEqual(
      filters,
    );
  });
});

describe('applyTagFilters', () => {
  it('writes tag filters as repeated parameters', () => {
    const next = applyTagFilters(new URLSearchParams(), { status: ['active'], search: 'promo' });

    expect(next.getAll('status')).toEqual(['active']);
    expect(next.get('search')).toBe('promo');
  });

  it('round-trips through parseTagFilters', () => {
    const filters: TagFilters = {
      status: ['active', 'archived'],
      search: 'promo',
      tenant: 'acme',
    };

    expect(parseTagFilters(applyTagFilters(new URLSearchParams(), filters))).toEqual(filters);
  });
});

describe('serialization', () => {
  it('sorts keys so equal template filters produce equal strings', () => {
    const a = serializeTemplateFilters({ name: 'x', key: 'y' });
    const b = serializeTemplateFilters({ key: 'y', name: 'x' });

    expect(a).toBe(b);
    expect(a).toBe('key=y&name=x');
  });

  it('produces an empty string for no filters', () => {
    expect(serializeTemplateFilters({})).toBe('');
    expect(serializeTagFilters({})).toBe('');
  });

  it('keeps every member of a list, in the order it was given', () => {
    // URLSearchParams.sort() orders by key and is stable, so members of one
    // list keep their relative order rather than being shuffled.
    expect(serializeTemplateFilters({ status: ['draft', 'active'] })).toBe(
      'status=draft&status=active',
    );
  });

  it("is order-sensitive within a list, since the array is the caller's", () => {
    expect(serializeTemplateFilters({ status: ['draft', 'active'] })).not.toBe(
      serializeTemplateFilters({ status: ['active', 'draft'] }),
    );
  });
});

describe('pruning', () => {
  it('drops undefined and empty values', () => {
    expect(pruneTemplateFilters({ name: 'x', key: undefined, description: '' })).toEqual({
      name: 'x',
    });
  });

  it('drops an empty list', () => {
    expect(pruneTemplateFilters({ status: [] })).toEqual({});
  });

  it('keeps false, which is a meaningful filter value', () => {
    expect(pruneTemplateFilters({ isAbstract: false })).toEqual({ isAbstract: false });
  });

  it('prunes tag filters too', () => {
    expect(pruneTagFilters({ search: '', tenant: 'acme' })).toEqual({ tenant: 'acme' });
  });
});

describe('hasActiveTemplateFilters', () => {
  it('is false for no filters', () => {
    expect(hasActiveTemplateFilters({})).toBe(false);
  });

  it('is true when a narrowing filter is set', () => {
    expect(hasActiveTemplateFilters({ name: 'welcome' })).toBe(true);
  });

  it('is true for a non-empty status list', () => {
    expect(hasActiveTemplateFilters({ status: ['draft'] })).toBe(true);
  });

  it('is false for an empty status list', () => {
    expect(hasActiveTemplateFilters({ status: [] })).toBe(false);
  });

  it('is false when only ordering is set, since sorting narrows nothing', () => {
    expect(hasActiveTemplateFilters({ orderByField: 'name', orderByDirection: 'asc' })).toBe(false);
  });

  it('is false for mostRecentActiveVersion at its default, which is the normal view', () => {
    expect(hasActiveTemplateFilters({ mostRecentActiveVersion: true })).toBe(false);
  });

  it('is true when mostRecentActiveVersion is switched off to show every version', () => {
    expect(hasActiveTemplateFilters({ mostRecentActiveVersion: false })).toBe(true);
  });

  it('is true for isAbstract=false, which is a real narrowing', () => {
    expect(hasActiveTemplateFilters({ isAbstract: false })).toBe(true);
  });
});

describe('hasActiveTagFilters', () => {
  it('is false for no filters', () => {
    expect(hasActiveTagFilters({})).toBe(false);
  });

  it('is true when a status is set', () => {
    expect(hasActiveTagFilters({ status: ['active'] })).toBe(true);
  });

  it('is true when a search is set', () => {
    expect(hasActiveTagFilters({ search: 'promo' })).toBe(true);
  });
});
