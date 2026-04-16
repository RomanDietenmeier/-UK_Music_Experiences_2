<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import pb from '$lib/pocketbase';
	import { currentUser } from '$lib/stores/auth';
	import type { Opportunity, Organisation } from '$lib/types';

	let org = $state<Organisation | null>(null);
	let opps = $state<Opportunity[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	onMount(async () => {
		const userId = $currentUser?.id;
		if (!userId) return;
		try {
			try {
				org = await pb
					.collection('organisations')
					.getFirstListItem<Organisation>(
						pb.filter('user = {:uid}', { uid: userId })
					);
			} catch (err) {
				if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
					org = null;
				} else {
					throw err;
				}
			}
			if (org) {
				opps = await pb.collection('opportunities').getFullList<Opportunity>({
					filter: pb.filter('organisation = {:oid}', { oid: org.id }),
					sort: '-created'
				});
			}
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loading = false;
		}
	});
</script>

<div class="h-full overflow-y-auto">
	<main class="mx-auto w-full max-w-3xl px-4 py-8">
		<a href={resolve('/dashboard')} class="text-sm text-sky-600 hover:text-sky-800">← Dashboard</a>

		{#if loading}
			<p class="mt-6 text-sm text-slate-500">Loading…</p>
		{:else if loadError}
			<p class="mt-6 text-sm text-rose-600">{loadError}</p>
		{:else if !org}
			<h1 class="mt-4 text-2xl font-bold text-slate-900">My opportunities</h1>
			<p class="mt-4 text-sm text-slate-600">
				Your account isn't linked to an organisation yet. Ask the platform admin to create
				an organisation record for you — once linked, opportunities you post will show up here.
			</p>
		{:else}
			<header class="mt-4">
				<div class="flex items-center gap-2">
					<h1 class="text-2xl font-bold text-slate-900">{org.name}</h1>
					{#if org.verified}
						<span
							class="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
							title="Verified by admin"
						>
							✓ Verified
						</span>
					{:else}
						<span
							class="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
							title="Awaiting admin verification"
						>
							Verification pending
						</span>
					{/if}
				</div>
				<p class="mt-1 text-sm text-slate-500">
					{opps.length} opportunit{opps.length === 1 ? 'y' : 'ies'}
				</p>
			</header>

			{#if opps.length === 0}
				<p class="mt-6 text-sm text-slate-600">No opportunities yet.</p>
			{:else}
				<ul class="mt-6 space-y-2">
					{#each opps as opp (opp.id)}
						<li>
							<a
								href={resolve('/opportunity/[id]', { id: opp.id })}
								class="block rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow"
							>
								<div class="flex items-start justify-between gap-2">
									<h2 class="text-sm font-semibold text-slate-900">{opp.title}</h2>
									<span
										class="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
									>
										{opp.type}
									</span>
								</div>
								<p class="mt-1 text-xs text-slate-500">{opp.location_name}</p>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</main>
</div>
