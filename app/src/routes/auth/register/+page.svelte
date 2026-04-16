<script lang="ts">
	import { goto } from '$app/navigation';
	import pb from '$lib/pocketbase';
	import type { UserRole } from '$lib/types';

	let email = $state('');
	let password = $state('');
	let passwordConfirm = $state('');
	let display_name = $state('');
	let role = $state<UserRole>('musician');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (password !== passwordConfirm) {
			error = "Passwords don't match";
			return;
		}
		busy = true;
		error = '';
		try {
			await pb.collection('users').create({
				email,
				password,
				passwordConfirm,
				role,
				display_name,
				emailVisibility: false
			});
			await pb.collection('users').authWithPassword(email, password);
			await goto('/dashboard');
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Registration failed';
		} finally {
			busy = false;
		}
	}
</script>

<div class="h-full overflow-y-auto">
	<main class="mx-auto w-full max-w-sm px-4 py-12">
		<h1 class="text-2xl font-bold text-slate-900">Register</h1>

		<form onsubmit={submit} class="mt-6 space-y-4">
			<label class="block">
				<span class="text-xs text-slate-600">Display name</span>
				<input
					type="text"
					required
					bind:value={display_name}
					class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>

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
					minlength={8}
					autocomplete="new-password"
					bind:value={password}
					class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>

			<label class="block">
				<span class="text-xs text-slate-600">Confirm password</span>
				<input
					type="password"
					required
					minlength={8}
					autocomplete="new-password"
					bind:value={passwordConfirm}
					class="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>

			<fieldset class="space-y-2">
				<legend class="text-xs text-slate-600">I am a…</legend>
				<label class="flex items-center gap-2 text-sm text-slate-700">
					<input type="radio" bind:group={role} value="musician" /> Musician
				</label>
				<label class="flex items-center gap-2 text-sm text-slate-700">
					<input type="radio" bind:group={role} value="organisation" /> Organisation
				</label>
			</fieldset>

			{#if error}
				<p class="text-sm text-rose-600">{error}</p>
			{/if}

			<button
				type="submit"
				disabled={busy}
				class="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
			>
				{busy ? 'Creating account…' : 'Create account'}
			</button>
		</form>

		<p class="mt-6 text-sm text-slate-600">
			Already have an account?
			<a href="/auth/login" class="text-sky-600 hover:text-sky-800">Log in →</a>
		</p>
	</main>
</div>
