<script lang="ts">
	import { resolve } from '$app/paths';
	import type { OpportunityWithDistance } from '$lib/filter';

	interface Props {
		opportunity: OpportunityWithDistance;
	}

	let { opportunity }: Props = $props();

	function formatDistance(d: number | null): string {
		if (d === null) return '';
		if (d < 1) return `${Math.round(d * 1000)} m`;
		return `${d.toFixed(1)} km`;
	}
</script>

<a
	href={resolve('/opportunity/[id]', { id: opportunity.id })}
	class="block w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow"
>
	<div class="flex items-start justify-between gap-2">
		<h3 class="text-sm font-semibold text-slate-900">{opportunity.title}</h3>
		<span
			class="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
		>
			{opportunity.type}
		</span>
	</div>
	<p class="mt-1 text-xs text-slate-500">{opportunity.location_name}</p>
	<div class="mt-1 flex gap-3 text-xs text-slate-400">
		{#if opportunity.age_group}
			<span>Ages: {opportunity.age_group}</span>
		{/if}
		{#if opportunity.distance !== null}
			<span class="text-slate-600">{formatDistance(opportunity.distance)}</span>
		{/if}
	</div>
</a>
