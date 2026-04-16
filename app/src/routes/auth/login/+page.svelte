<script lang="ts">
	import { goto } from '$app/navigation';
	import pb from '$lib/pocketbase';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			await pb.collection('users').authWithPassword(email, password);
			await goto('/dashboard');
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Login failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="h-full overflow-y-auto">
	<main class="mx-auto w-full max-w-sm px-4 py-12">
		<h1 class="text-2xl font-bold text-slate-900">Log in</h1>

		<form onsubmit={submit} class="mt-6 space-y-4">
			<label class="block">
				<span class="text-xs text-slate-600">Email</span>
				<input
					type="email"
					required
					autocomplete="email"
					bind:value={email}
					class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>

			<label class="block">
				<span class="text-xs text-slate-600">Password</span>
				<input
					type="password"
					required
					autocomplete="current-password"
					bind:value={password}
					class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>

			{#if error}
				<p class="text-sm text-rose-600">{error}</p>
			{/if}

			<button
				type="submit"
				disabled={busy}
				class="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
			>
				{busy ? 'Logging in…' : 'Log in'}
			</button>
		</form>

		<p class="mt-6 text-sm text-slate-600">
			No account?
			<a href="/auth/register" class="text-sky-600 hover:text-sky-800">Register →</a>
		</p>
	</main>
</div>
