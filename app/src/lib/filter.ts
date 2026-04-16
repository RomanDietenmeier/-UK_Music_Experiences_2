import { haversineDistance } from '$lib/geo';
import type { Opportunity, FilterState } from '$lib/types';

export interface OpportunityWithDistance extends Opportunity {
	distance: number | null;
}

export function filterOpportunities(
	opps: Opportunity[],
	state: FilterState
): OpportunityWithDistance[] {
	const { query, type, proximityCenter, proximityRadius, sortKey, sortDir } = state;
	const q = query.trim().toLowerCase();

	// 1. Enrich with distance
	let results: OpportunityWithDistance[] = opps.map((o) => ({
		...o,
		distance: proximityCenter
			? haversineDistance(proximityCenter.lat, proximityCenter.lng, o.location_lat, o.location_lng)
			: null
	}));

	// 2. Text filter across title, description, instruments, location_name
	if (q) {
		results = results.filter((o) => {
			const hay = [
				o.title,
				o.description ?? '',
				o.instruments ?? '',
				o.location_name
			]
				.join(' ')
				.toLowerCase();
			return hay.includes(q);
		});
	}

	// 3. Type filter
	if (type) {
		results = results.filter((o) => o.type === type);
	}

	// 4. Proximity radius filter
	if (proximityCenter) {
		results = results.filter((o) => o.distance !== null && o.distance <= proximityRadius);
	}

	// 5. Sort
	results.sort((a, b) => {
		let cmp = 0;
		switch (sortKey) {
			case 'distance':
				cmp = (a.distance ?? Infinity) - (b.distance ?? Infinity);
				break;
			case 'name':
				cmp = a.title.localeCompare(b.title);
				break;
			case 'type':
				cmp = a.type.localeCompare(b.type);
				break;
			case 'region':
				cmp = a.location_name.localeCompare(b.location_name);
				break;
		}
		return sortDir === 'asc' ? cmp : -cmp;
	});

	return results;
}
