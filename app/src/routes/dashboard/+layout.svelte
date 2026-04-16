<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { currentUser } from '$lib/stores/auth';

	let { children } = $props();

	// Guard all /dashboard/** routes. If the user logs out from anywhere,
	// the redirect fires automatically.
	$effect(() => {
		if ($currentUser === null) {
			goto(resolve('/auth/login'));
		}
	});
</script>

{#if $currentUser}
	{@render children()}
{/if}
