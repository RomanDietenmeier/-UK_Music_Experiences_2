<script lang="ts">
	import pb from '$lib/pocketbase';
	import { PUBLIC_PB_URL } from '$env/static/public';

	// Reference pb so it's not tree-shaken; harmless in dev, strips in prod if unused.
	void pb;
</script>

<main class="min-h-screen flex items-center justify-center bg-slate-50">
	<div class="max-w-md p-8 rounded-2xl bg-white shadow text-center space-y-2">
		<h1 class="text-2xl font-semibold text-slate-900">UK Music Experiences</h1>
		<p class="text-sm text-slate-500">SvelteKit skeleton — Phase 7.</p>
		<p class="text-xs text-slate-400">PocketBase: {PUBLIC_PB_URL}</p>
	</div>
</main>
