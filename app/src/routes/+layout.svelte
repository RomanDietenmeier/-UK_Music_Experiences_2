<script lang="ts">
	import { goto } from '$app/navigation';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import pb from '$lib/pocketbase';
	import { currentUser } from '$lib/stores/auth';

	let { children } = $props();

	async function logout() {
		pb.authStore.clear();
		await goto('/');
	}
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
		{#if $currentUser}
			<a href="/dashboard" class="text-sm text-slate-700 hover:text-slate-900">Dashboard</a>
			<span class="text-sm text-slate-500">{$currentUser.display_name}</span>
			<button
				type="button"
				onclick={logout}
				class="text-sm text-slate-700 hover:text-slate-900"
			>
				Log out
			</button>
		{:else}
			<a href="/auth/login" class="text-sm text-slate-700 hover:text-slate-900">Log in</a>
			<a
				href="/auth/register"
				class="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white hover:bg-slate-700"
			>
				Register
			</a>
		{/if}
	</nav>
	<main class="flex min-h-0 flex-1 flex-col">
		{@render children()}
	</main>
</div>
