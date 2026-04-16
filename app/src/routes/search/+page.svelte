<script lang="ts">
	import { onMount } from 'svelte';
	import pb from '$lib/pocketbase';
	import { filters } from '$lib/stores/filters';
	import { filterOpportunities } from '$lib/filter';
	import type { Opportunity } from '$lib/types';
	import LeafletMap from '$lib/components/LeafletMap.svelte';
	import SearchFilters from '$lib/components/SearchFilters.svelte';
	import OpportunityCard from '$lib/components/OpportunityCard.svelte';

	let all = $state<Opportunity[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let selectedId = $state<string | null>(null);

	onMount(async () => {
		try {
			all = await pb.collection('opportunities').getFullList<Opportunity>({ sort: 'title' });
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load opportunities';
		} finally {
			loading = false;
		}
	});

	const filtered = $derived(filterOpportunities(all, $filters));
</script>

<div class="flex h-screen flex-col bg-slate-50">
	<SearchFilters />

	<div class="flex flex-1 flex-col overflow-hidden md:flex-row">
		<div class="h-[50vh] md:h-auto md:w-1/2 md:flex-1">
			<LeafletMap
				opportunities={filtered}
				{selectedId}
				center={$filters.proximityCenter}
				radiusKm={$filters.proximityRadius}
				onMarkerClick={(id) => (selectedId = id)}
			/>
		</div>

		<aside
			class="flex-1 overflow-y-auto border-t border-slate-200 bg-white p-3 md:w-1/2 md:border-l md:border-t-0"
		>
			{#if loading}
				<p class="text-sm text-slate-500">Loading…</p>
			{:else if loadError}
				<p class="text-sm text-rose-600">{loadError}</p>
			{:else if filtered.length === 0}
				<p class="text-sm text-slate-500">No opportunities match your filters.</p>
			{:else}
				<p class="mb-2 text-xs text-slate-500">{filtered.length} result{filtered.length === 1 ? '' : 's'}</p>
				<div class="space-y-2">
					{#each filtered as opp (opp.id)}
						<OpportunityCard
							opportunity={opp}
							selected={selectedId === opp.id}
							onClick={(id) => (selectedId = id)}
						/>
					{/each}
				</div>
			{/if}
		</aside>
	</div>
</div>
