// Haversine distance + bounding-box helpers. Pure math, no dependencies.

export interface BoundingBox {
	minLat: number;
	maxLat: number;
	minLng: number;
	maxLng: number;
}

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
	return deg * (Math.PI / 180);
}

// Great-circle distance in km between two WGS84 points. Rounded to 1 decimal.
export function haversineDistance(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): number {
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.sin(dLng / 2) *
			Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return Math.round(EARTH_RADIUS_KM * c * 10) / 10;
}

// Bounding box around a point for pre-filtering before Haversine sort.
// 111.32 km per degree of latitude; longitude degrees shrink by cos(lat).
export function boundingBox(lat: number, lng: number, radiusKm: number): BoundingBox {
	const latDelta = radiusKm / 111.32;
	const lngDelta = radiusKm / (111.32 * Math.cos(toRad(lat)));
	return {
		minLat: lat - latDelta,
		maxLat: lat + latDelta,
		minLng: lng - lngDelta,
		maxLng: lng + lngDelta
	};
}
