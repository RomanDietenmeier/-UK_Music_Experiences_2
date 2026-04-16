import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { filters, resetFilters, DEFAULT_FILTERS } from './filters';

describe('filters store', () => {
	beforeEach(() => {
		resetFilters();
	});

	it('initial value equals DEFAULT_FILTERS', () => {
		expect(get(filters)).toEqual(DEFAULT_FILTERS);
	});

	it('updates propagate through the store', () => {
		filters.update((s) => ({ ...s, query: 'guitar' }));
		expect(get(filters).query).toBe('guitar');
	});

	it('resetFilters restores defaults after a mutation', () => {
		filters.update((s) => ({ ...s, query: 'x', proximityRadius: 100 }));
		resetFilters();
		expect(get(filters)).toEqual(DEFAULT_FILTERS);
	});
});
