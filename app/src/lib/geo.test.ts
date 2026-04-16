import { describe, it, expect } from 'vitest';
import { haversineDistance, boundingBox } from './geo';

describe('haversineDistance', () => {
	it('returns 0 for identical points', () => {
		expect(haversineDistance(51.5074, -0.1278, 51.5074, -0.1278)).toBe(0);
	});

	it('returns ~533km between London and Edinburgh', () => {
		const d = haversineDistance(51.5074, -0.1278, 55.9533, -3.1883);
		expect(d).toBeGreaterThan(528);
		expect(d).toBeLessThan(538);
	});

	it('returns ~129km between Farnham and Bristol', () => {
		const d = haversineDistance(51.214, -0.799, 51.454, -2.597);
		expect(d).toBeGreaterThan(124);
		expect(d).toBeLessThan(134);
	});

	it('is symmetric: d(A,B) === d(B,A)', () => {
		const ab = haversineDistance(51.5074, -0.1278, 55.9533, -3.1883);
		const ba = haversineDistance(55.9533, -3.1883, 51.5074, -0.1278);
		expect(ab).toBe(ba);
	});
});

describe('boundingBox', () => {
	it('produces the four expected keys with min < max', () => {
		const bb = boundingBox(51.5, 0, 10);
		expect(bb).toHaveProperty('minLat');
		expect(bb).toHaveProperty('maxLat');
		expect(bb).toHaveProperty('minLng');
		expect(bb).toHaveProperty('maxLng');
		expect(bb.minLat).toBeLessThan(bb.maxLat);
		expect(bb.minLng).toBeLessThan(bb.maxLng);
	});

	it('latDelta matches 1 degree ≈ 111.32 km', () => {
		const bb = boundingBox(51.5, 0, 10);
		const latDelta = (bb.maxLat - bb.minLat) / 2;
		expect(latDelta).toBeCloseTo(10 / 111.32, 4);
	});

	it('lngDelta equals latDelta at the equator', () => {
		const bb = boundingBox(0, 0, 10);
		const latDelta = (bb.maxLat - bb.minLat) / 2;
		const lngDelta = (bb.maxLng - bb.minLng) / 2;
		expect(lngDelta).toBeCloseTo(latDelta, 6);
	});

	it('lngDelta ≈ 2× latDelta at 60°N (cos 60° = 0.5)', () => {
		const bb = boundingBox(60, 0, 10);
		const latDelta = (bb.maxLat - bb.minLat) / 2;
		const lngDelta = (bb.maxLng - bb.minLng) / 2;
		expect(lngDelta / latDelta).toBeCloseTo(2, 3);
	});
});
