<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { OpportunityWithDistance } from '$lib/filter';

	type LeafletModule = typeof import('leaflet');
	type L_Map = import('leaflet').Map;
	type L_Layer = import('leaflet').Layer;
	type L_Circle = import('leaflet').Circle;

	interface Props {
		opportunities: OpportunityWithDistance[];
		selectedId?: string | null;
		center?: { lat: number; lng: number } | null;
		radiusKm?: number;
		onMarkerClick?: (id: string) => void;
	}

	let {
		opportunities,
		selectedId = null,
		center = null,
		radiusKm = 25,
		onMarkerClick
	}: Props = $props();

	let container: HTMLDivElement;
	let L: LeafletModule | null = $state(null);
	let map: L_Map | null = null;
	let markersLayer: L_Layer | null = null;
	let circle: L_Circle | null = null;
	const markersById = new Map<string, import('leaflet').Marker>();

	// Init map after mount. Dynamic import of Leaflet keeps the module out of
	// any SSR / build-time analysis that might touch window.
	onMount(async () => {
		const leaflet = await import('leaflet');
		await import('leaflet/dist/leaflet.css');

		// Fix Vite-bundled default marker icon paths.
		const iconUrl = (await import('leaflet/dist/images/marker-icon.png')).default;
		const iconRetinaUrl = (await import('leaflet/dist/images/marker-icon-2x.png')).default;
		const shadowUrl = (await import('leaflet/dist/images/marker-shadow.png')).default;
		leaflet.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

		L = leaflet;
		map = leaflet.map(container).setView([54.5, -2], 6);
		leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
			attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
			maxZoom: 19
		}).addTo(map);
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
	});

	// Rebuild markers whenever opportunities change.
	$effect(() => {
		const opps = opportunities; // always read, so it's tracked
		if (!L || !map) return;
		const leaflet = L;
		if (markersLayer) {
			markersLayer.remove();
			markersLayer = null;
		}
		markersById.clear();

		const group = leaflet.featureGroup();
		for (const opp of opps) {
			const marker = leaflet.marker([opp.location_lat, opp.location_lng]);
			marker.bindPopup(
				`<strong>${escapeHtml(opp.title)}</strong><br/><em>${escapeHtml(opp.type)}</em><br/>${escapeHtml(opp.location_name)}`
			);
			marker.on('click', () => onMarkerClick?.(opp.id));
			marker.addTo(group);
			markersById.set(opp.id, marker);
		}
		group.addTo(map);
		markersLayer = group;
	});

	// Manage proximity circle.
	$effect(() => {
		const c = center; // always read, so it's tracked
		const r = radiusKm;
		if (!L || !map) return;
		const leaflet = L;
		if (circle) {
			circle.remove();
			circle = null;
		}
		if (c) {
			circle = leaflet
				.circle([c.lat, c.lng], {
					radius: r * 1000,
					color: '#eab308',
					fillColor: '#eab308',
					fillOpacity: 0.08,
					weight: 1,
					dashArray: '6 4'
				})
				.addTo(map);
		}
	});

	// Fly to the selected marker.
	// NOTE: read `selectedId` unconditionally first so Svelte tracks it as a
	// dependency even on the initial run when `map` is still null. Otherwise the
	// `!map || !selectedId` short-circuit skips the selectedId read, and later
	// changes don't retrigger the effect.
	$effect(() => {
		const id = selectedId;
		if (!id || !map) return;
		const marker = markersById.get(id);
		if (!marker) return;
		const { lat, lng } = marker.getLatLng();
		map.flyTo([lat, lng], 13, { duration: 0.8 });
		marker.openPopup();
	});

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
</script>

<div bind:this={container} class="h-full w-full"></div>
