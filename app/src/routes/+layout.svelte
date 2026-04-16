<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex h-screen flex-col bg-slate-50">
	<nav class="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
		<a href="/" class="font-semibold text-slate-900 hover:text-slate-700">
			UK Music Experiences
		</a>
		<div class="flex-1"></div>
		<a href="/search" class="text-sm text-slate-700 hover:text-slate-900">Search</a>
		<a href="/advice" class="text-sm text-slate-700 hover:text-slate-900">Advice</a>
	</nav>
	<main class="flex min-h-0 flex-1 flex-col">
		{@render children()}
	</main>
</div>
