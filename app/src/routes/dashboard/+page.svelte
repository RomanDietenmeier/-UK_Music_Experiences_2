<script lang="ts">
	import { resolve } from '$app/paths';
	import { currentUser } from '$lib/stores/auth';
</script>

<div class="h-full overflow-y-auto">
	<main class="mx-auto w-full max-w-3xl px-4 py-12">
		{#if $currentUser}
			<h1 class="text-2xl font-bold text-slate-900">Welcome, {$currentUser.display_name}</h1>

			{#if $currentUser.role === 'musician'}
				<p class="mt-4 text-slate-600">
					Saved opportunities and personalised recommendations are coming soon. In the
					meantime, head to
					<a href={resolve('/search')} class="text-sky-600 hover:text-sky-800">Search</a>
					to find opportunities near you.
				</p>
			{:else if $currentUser.role === 'organisation'}
				<p class="mt-4 text-slate-600">Manage opportunities posted by your organisation.</p>
				<a
					href={resolve('/dashboard/opportunities')}
					class="mt-6 inline-block rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					View my opportunities →
				</a>
			{/if}
		{/if}
	</main>
</div>
