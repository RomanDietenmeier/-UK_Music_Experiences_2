import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCached, setCache, clearCache, cacheKey } from './cache';

describe('cache', () => {
	beforeEach(() => {
		clearCache();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
		clearCache();
	});

	it('returns null for a missing key', () => {
		expect(getCached('missing')).toBeNull();
	});

	it('round-trips a value via setCache + getCached', () => {
		setCache('k', { foo: 'bar' });
		expect(getCached<{ foo: string }>('k')).toEqual({ foo: 'bar' });
	});

	it('returns null after the TTL elapses', () => {
		setCache('k', 'v', 100);
		vi.advanceTimersByTime(101);
		expect(getCached('k')).toBeNull();
	});

	it('returns the value while still inside the TTL', () => {
		setCache('k', 'v', 100);
		vi.advanceTimersByTime(50);
		expect(getCached('k')).toBe('v');
	});

	it('evicts the oldest entry when capacity is exceeded', () => {
		for (let i = 0; i < 100; i++) setCache(`k${i}`, i);
		expect(getCached('k0')).toBe(0);
		setCache('newest', 'added');
		expect(getCached('k0')).toBeNull();
		expect(getCached('newest')).toBe('added');
	});

	it('clearCache empties all entries', () => {
		setCache('a', 1);
		setCache('b', 2);
		clearCache();
		expect(getCached('a')).toBeNull();
		expect(getCached('b')).toBeNull();
	});
});

describe('cacheKey', () => {
	it('produces identical keys for identical params', () => {
		const k1 = cacheKey('search', { q: 'a', type: 'b' });
		const k2 = cacheKey('search', { q: 'a', type: 'b' });
		expect(k1).toBe(k2);
	});

	it('produces different keys for different params', () => {
		const k1 = cacheKey('search', { q: 'a' });
		const k2 = cacheKey('search', { q: 'b' });
		expect(k1).not.toBe(k2);
	});

	it('namespaces by prefix', () => {
		expect(cacheKey('a', { x: 1 })).not.toBe(cacheKey('b', { x: 1 }));
	});
});
