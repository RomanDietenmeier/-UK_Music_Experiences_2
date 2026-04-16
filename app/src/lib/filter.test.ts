import { describe, it, expect } from 'vitest';
import { filterOpportunities } from './filter';
import type { Opportunity, FilterState } from '$lib/types';

// Minimal fixture mirroring the faker demo data.
function makeOpp(overrides: Partial<Opportunity>): Opportunity {
	return {
		id: '0',
		created: '',
		updated: '',
		collectionId: '',
		collectionName: 'opportunities',
		organisation: 'demo',
		title: 'Untitled',
		description: '',
		type: 'Workshop',
		location_name: 'Nowhere',
		location_lat: 0,
		location_lng: 0,
		postcode: '',
		...overrides
	};
}

const farnham = makeOpp({
	id: 'a',
	title: 'Farnham Youth Guitar Workshop',
	type: 'Workshop',
	location_name: 'Farnham Maltings, Farnham',
	location_lat: 51.214,
	location_lng: -0.799,
	instruments: 'Guitar'
});
const bristol = makeOpp({
	id: 'b',
	title: 'Bristol Community Choir',
	type: 'Ensemble',
	location_name: "St George's, Bristol",
	location_lat: 51.454,
	location_lng: -2.597,
	instruments: 'Voice'
});
const brighton = makeOpp({
	id: 'c',
	title: 'Brighton Jazz Ensemble',
	type: 'Ensemble',
	location_name: 'The Old Market, Brighton',
	location_lat: 50.829,
	location_lng: -0.137,
	instruments: 'Saxophone, Trumpet'
});

const ALL = [farnham, bristol, brighton];

const DEFAULTS: FilterState = {
	query: '',
	type: '',
	region: '',
	proximityCenter: null,
	proximityRadius: 25,
	sortKey: 'name',
	sortDir: 'asc'
};

describe('filterOpportunities', () => {
	it('empty input returns empty output', () => {
		expect(filterOpportunities([], DEFAULTS)).toEqual([]);
	});

	it('no filters returns all items with distance=null', () => {
		const out = filterOpportunities(ALL, DEFAULTS);
		expect(out).toHaveLength(3);
		for (const o of out) expect(o.distance).toBeNull();
	});

	it('query matches title', () => {
		const out = filterOpportunities(ALL, { ...DEFAULTS, query: 'guitar' });
		expect(out.map((o) => o.id)).toEqual(['a']);
	});

	it('query matches location_name', () => {
		const out = filterOpportunities(ALL, { ...DEFAULTS, query: 'bristol' });
		expect(out.map((o) => o.id)).toEqual(['b']);
	});

	it('query matches instruments', () => {
		const out = filterOpportunities(ALL, { ...DEFAULTS, query: 'saxophone' });
		expect(out.map((o) => o.id)).toEqual(['c']);
	});

	it('query is case-insensitive', () => {
		const out = filterOpportunities(ALL, { ...DEFAULTS, query: 'BRISTOL' });
		expect(out.map((o) => o.id)).toEqual(['b']);
	});

	it('type filter narrows to matching type', () => {
		const out = filterOpportunities(ALL, { ...DEFAULTS, type: 'Ensemble' });
		expect(out.map((o) => o.id).sort()).toEqual(['b', 'c']);
	});

	it('empty type is a no-op', () => {
		const out = filterOpportunities(ALL, { ...DEFAULTS, type: '' });
		expect(out).toHaveLength(3);
	});

	it('proximity center + 25km radius from Farnham keeps only Farnham', () => {
		const out = filterOpportunities(ALL, {
			...DEFAULTS,
			proximityCenter: { lat: 51.214, lng: -0.799 },
			proximityRadius: 25
		});
		expect(out.map((o) => o.id)).toEqual(['a']);
		expect(out[0].distance).toBe(0);
	});

	it('proximity center populates distance on every result', () => {
		const out = filterOpportunities(ALL, {
			...DEFAULTS,
			proximityCenter: { lat: 51.5074, lng: -0.1278 }, // London
			proximityRadius: 1000
		});
		for (const o of out) {
			expect(o.distance).not.toBeNull();
			expect(typeof o.distance).toBe('number');
		}
	});

	it('sort by name desc reverses alphabetical order', () => {
		const asc = filterOpportunities(ALL, { ...DEFAULTS, sortKey: 'name', sortDir: 'asc' });
		const desc = filterOpportunities(ALL, { ...DEFAULTS, sortKey: 'name', sortDir: 'desc' });
		expect(desc.map((o) => o.id)).toEqual([...asc.map((o) => o.id)].reverse());
	});

	it('sort by distance with no proximity center pushes all to end equally', () => {
		const out = filterOpportunities(ALL, { ...DEFAULTS, sortKey: 'distance' });
		expect(out).toHaveLength(3);
		for (const o of out) expect(o.distance).toBeNull();
	});
});
