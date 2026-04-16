<script lang="ts">
	// Landing page — two-card explainer, one live CTA.
</script>

<div class="h-full overflow-y-auto">
	<main class="mx-auto w-full max-w-4xl px-4 py-12">
		<h1 class="text-3xl font-bold text-slate-900">UK Music Experiences</h1>
		<p class="mt-2 text-slate-600">
			Find music opportunities across the UK — classes, ensembles, workshops, and more.
		</p>

		<div class="mt-8 grid gap-4 md:grid-cols-2">
			<a
				href="/search"
				class="group block rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow"
			>
				<h2 class="text-lg font-semibold text-slate-900">For musicians</h2>
				<p class="mt-2 text-sm text-slate-600">
					Search opportunities by type, instrument, age, or location.
				</p>
				<span class="mt-4 inline-block text-sm font-medium text-sky-600 group-hover:text-sky-800">
					Find opportunities →
				</span>
			</a>

			<a
				href="/auth/register"
				class="group block rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-slate-300 hover:shadow"
			>
				<h2 class="text-lg font-semibold text-slate-900">For organisations</h2>
				<p class="mt-2 text-sm text-slate-600">
					Post classes, workshops, and ensembles. Verification by the platform admin is
					required before opportunities go live.
				</p>
				<span class="mt-4 inline-block text-sm font-medium text-sky-600 group-hover:text-sky-800">
					Register your organisation →
				</span>
			</a>
		</div>
	</main>
</div>
