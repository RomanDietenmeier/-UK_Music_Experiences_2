import { writable } from 'svelte/store';
import pb from '$lib/pocketbase';
import type { AppUser } from '$lib/types';

export const currentUser = writable<AppUser | null>(
	(pb.authStore.record as AppUser | null) ?? null
);

pb.authStore.onChange(() => {
	currentUser.set((pb.authStore.record as AppUser | null) ?? null);
});
