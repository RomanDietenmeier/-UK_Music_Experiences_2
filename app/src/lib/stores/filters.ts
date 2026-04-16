import { writable } from 'svelte/store';
import type { FilterState } from '$lib/types';

export const DEFAULT_FILTERS: FilterState = {
	query: '',
	type: '',
	region: '',
	proximityCenter: null,
	proximityRadius: 25,
	sortKey: 'name',
	sortDir: 'asc'
};

export const filters = writable<FilterState>({ ...DEFAULT_FILTERS });

export function resetFilters(): void {
	filters.set({ ...DEFAULT_FILTERS });
}
