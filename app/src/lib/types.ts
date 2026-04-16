// PocketBase record shapes + client-side filter state.
// Field names and types mirror scripts/setup.mjs exactly.

export interface PBRecord {
	id: string;
	created: string;
	updated: string;
	collectionId: string;
	collectionName: string;
}

export type OpportunityType =
	| 'Classes'
	| 'Ensemble'
	| 'Workshop'
	| 'Performance'
	| 'Lessons'
	| 'Project';

export interface Opportunity extends PBRecord {
	organisation: string;
	title: string;
	description: string;
	type: OpportunityType;
	instruments?: string;
	age_group?: string;
	website?: string;
	location_name: string;
	location_lat: number;
	location_lng: number;
	postcode: string;
	expires_at?: string;
}

export interface Organisation extends PBRecord {
	user: string;
	name: string;
	description?: string;
	verified: boolean;
}

export interface Postcode extends PBRecord {
	postcode: string;
	lat: number;
	lng: number;
}

export interface Place extends PBRecord {
	name: string;
	source: string;
	lat: number;
	lng: number;
	count?: number;
}

export type UserRole = 'musician' | 'organisation';

export interface AppUser extends PBRecord {
	email: string;
	emailVisibility: boolean;
	verified: boolean;
	role: UserRole;
	display_name: string;
}

export type SortKey = 'name' | 'type' | 'region' | 'distance';
export type SortDir = 'asc' | 'desc';

export interface FilterState {
	query: string;
	type: OpportunityType | '';
	region: string;
	proximityCenter: { lat: number; lng: number } | null;
	proximityRadius: number;
	sortKey: SortKey;
	sortDir: SortDir;
}
