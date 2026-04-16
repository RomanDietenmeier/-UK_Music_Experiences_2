<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import pb from '$lib/pocketbase';
	import type { Opportunity, Organisation } from '$lib/types';

	interface OpportunityWithOrg extends Opportunity {
		expand?: { organisation?: Organisation };
	}

	let opp = $state<OpportunityWithOrg | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		const id = page.params.id;
		if (!id) {
			loadError = 'Missing opportunity id';
			loading = false;
			return;
		}
		try {
			opp = await pb
				.collection('opportunities')
				.getOne<OpportunityWithOrg>(id, { expand: 'organisation' });
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load opportunity';
		} finally {
			loading = false;
		}
	});
</script>

<div class="h-full overflow-y-auto">
	<main class="mx-auto w-full max-w-3xl px-4 py-8">
		<a href="/search" class="text-sm text-sky-600 hover:text-sky-800">← Back to search</a>

		{#if loading}
			<p class="mt-6 text-sm text-slate-500">Loading…</p>
		{:else if loadError || !opp}
			<div class="mt-6">
				<p class="text-sm text-rose-600">Opportunity not found.</p>
				{#if loadError}
					<p class="mt-1 text-xs text-slate-400">{loadError}</p>
				{/if}
			</div>
		{:else}
			<header class="mt-4">
				<div class="flex items-start justify-between gap-3">
					<h1 class="text-2xl font-bold text-slate-900">{opp.title}</h1>
					<span
						class="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
					>
						{opp.type}
					</span>
				</div>
				<p class="mt-1 text-sm text-slate-500">{opp.location_name} · {opp.postcode}</p>
			</header>

			<dl class="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
				{#if opp.age_group}
					<div><dt class="text-slate-500">Ages</dt><dd>{opp.age_group}</dd></div>
				{/if}
				{#if opp.instruments}
					<div><dt class="text-slate-500">Instruments</dt><dd>{opp.instruments}</dd></div>
				{/if}
			</dl>

			{#if opp.description}
				<section class="mt-6">
					<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">About</h2>
					<p class="mt-2 whitespace-pre-wrap text-sm text-slate-700">{opp.description}</p>
				</section>
			{/if}

			{#if opp.website}
				<p class="mt-6 text-sm">
					<a
						href={opp.website}
						target="_blank"
						rel="noopener noreferrer"
						class="text-sky-600 hover:text-sky-800"
					>
						Visit opportunity website →
					</a>
				</p>
			{/if}

			{#if opp.expand?.organisation}
				<section class="mt-8 rounded-lg border border-slate-200 bg-white p-4">
					<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">
						Organisation
					</h2>
					<div class="mt-2 flex items-center gap-2">
						<span class="font-medium text-slate-900">{opp.expand.organisation.name}</span>
						{#if opp.expand.organisation.verified}
							<span
								class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
								title="Verified by admin"
							>
								✓ Verified
							</span>
						{/if}
					</div>
					{#if opp.expand.organisation.description}
						<p class="mt-2 whitespace-pre-wrap text-sm text-slate-700">
							{opp.expand.organisation.description}
						</p>
					{/if}
				</section>
			{/if}
		{/if}
	</main>
</div>
