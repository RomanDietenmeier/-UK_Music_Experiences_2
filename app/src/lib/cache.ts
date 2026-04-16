// In-memory TTL cache with rough LRU eviction. Module-scoped Map;
// single shared instance per browser session (or per Node test run).

interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number;
}

const DEFAULT_TTL = 60_000; // 60s
const MAX_ENTRIES = 100;

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
	const entry = cache.get(key);
	if (!entry) return null;
	if (Date.now() - entry.timestamp > entry.ttl) {
		cache.delete(key);
		return null;
	}
	return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
	if (cache.size >= MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(key, { data, timestamp: Date.now(), ttl });
}

export function clearCache(): void {
	cache.clear();
}

export function cacheKey(prefix: string, params: unknown): string {
	return prefix + ':' + JSON.stringify(params);
}
