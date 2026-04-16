<script lang="ts">
	import pb from '$lib/pocketbase';
	import { filters, resetFilters } from '$lib/stores/filters';
	import type { OpportunityType, Postcode, Place } from '$lib/types';

	const TYPES: OpportunityType[] = [
		'Classes',
		'Ensemble',
		'Workshop',
		'Performance',
		'Lessons',
		'Project'
	];

	const RADII = [5, 10, 25, 50, 100];

	const POSTCODE_REGEX = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

	let locationInput = $state('');
	let lookupError = $state('');
	let lookupBusy = $state(false);

	async function resolveLocation() {
		const q = locationInput.trim();
		if (!q) {
			filters.update((s) => ({ ...s, proximityCenter: null }));
			lookupError = '';
			return;
		}
		lookupBusy = true;
		lookupError = '';
		try {
			if (POSTCODE_REGEX.test(q)) {
				const normalized = q.toUpperCase().replace(/\s+/g, ' ').trim();
				const rec = await pb
					.collection('postcodes')
					.getFirstListItem<Postcode>(
						pb.filter('postcode = {:pc}', { pc: normalized })
					);
				filters.update((s) => ({
					...s,
					proximityCenter: { lat: rec.lat, lng: rec.lng },
					sortKey: 'distance',
					sortDir: 'asc'
				}));
			} else {
				const name = q.charAt(0).toUpperCase() + q.slice(1).toLowerCase();
				const rec = await pb
					.collection('places')
					.getFirstListItem<Place>(
						pb.filter('name = {:name}', { name })
					);
				filters.update((s) => ({
					...s,
					proximityCenter: { lat: rec.lat, lng: rec.lng },
					sortKey: 'distance',
					sortDir: 'asc'
				}));
			}
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
				lookupError = `Couldn't find "${q}"`;
			} else {
				lookupError = 'Location lookup failed';
			}
			filters.update((s) => ({ ...s, proximityCenter: null }));
		} finally {
			lookupBusy = false;
		}
	}

	function clearAll() {
		resetFilters();
		locationInput = '';
		lookupError = '';
	}
</script>

<div class="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-white p-3">
	<label class="flex flex-col text-xs text-slate-600">
		Search
		<input
			type="text"
			placeholder="guitar, voice, Farnham…"
			class="mt-1 w-56 rounded border border-slate-300 px-2 py-1.5 text-sm"
			value={$filters.query}
			oninput={(e) =>
				filters.update((s) => ({ ...s, query: (e.currentTarget as HTMLInputElement).value }))}
		/>
	</label>

	<label class="flex flex-col text-xs text-slate-600">
		Type
		<select
			class="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
			value={$filters.type}
			onchange={(e) =>
				filters.update((s) => ({
					...s,
					type: (e.currentTarget as HTMLSelectElement).value as OpportunityType | ''
				}))}
		>
			<option value="">All types</option>
			{#each TYPES as t}
				<option value={t}>{t}</option>
			{/each}
		</select>
	</label>

	<label class="flex flex-col text-xs text-slate-600">
		Postcode or place
		<input
			type="text"
			placeholder="GU9 7QR or Farnham"
			class="mt-1 w-48 rounded border border-slate-300 px-2 py-1.5 text-sm"
			bind:value={locationInput}
			onchange={resolveLocation}
			disabled={lookupBusy}
		/>
	</label>

	<label class="flex flex-col text-xs text-slate-600">
		Radius
		<select
			class="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
			value={$filters.proximityRadius}
			onchange={(e) =>
				filters.update((s) => ({
					...s,
					proximityRadius: Number((e.currentTarget as HTMLSelectElement).value)
				}))}
		>
			{#each RADII as r}
				<option value={r}>{r} km</option>
			{/each}
		</select>
	</label>

	<button
		type="button"
		class="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-300"
		onclick={clearAll}
	>
		Clear
	</button>

	{#if lookupError}
		<span class="text-xs text-rose-600">{lookupError}</span>
	{/if}
</div>
