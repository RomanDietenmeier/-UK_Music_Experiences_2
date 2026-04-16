# CLAUDE.md — Music Opportunities Platform (Nathan's Project)

## Project Overview

Build a music opportunities platform for the UK connecting two user groups:
- **Musicians** search for opportunities by instrument, age group, and location
- **Organisations** post, manage, and edit opportunities (after admin verification)

The admin (Nathan) manages verifications and data exports via PocketBase's built-in admin UI. A dedicated `researcher` role may be added later if academic/policy users need self-serve data access.

The platform is based in Farnham, UK. Child safeguarding and GDPR compliance are critical requirements.

### Old Prototype Reference
A working React + Vite + Leaflet prototype lives in `20260319_old_prototype/`. It displays ~918 geocoded UK music opportunities on an interactive map with a linked table. Reference it for Leaflet patterns (`src/components/OpportunityMap.tsx`), filter logic (`src/hooks/useStoreFilter.ts`), icon assets (`public/symbols/`), and the full dataset (`src/data/opportunities.json`) when ready to migrate real data.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend/DB/Auth/API | **PocketBase** | Single Go binary. SQLite, built-in auth, REST API, admin UI, file storage. Runs on port 8090. |
| Frontend | **SvelteKit** (static adapter) | Compiles to static HTML/CSS/JS. No Node.js on production server. All API calls happen client-side via PocketBase JS SDK. |
| Map | **Leaflet** (1.9+) | Used directly in Svelte via `onMount` — no wrapper library. Interactive map is the primary search UI. |
| Tiles | **CartoDB light_all** | `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` — free, no API key. |
| Geo | **ONS Postcode Directory** + **OS Open Names** (both local) + **Haversine formula** | Postcodes (~1.7M rows) and place names (~30K–50K rows) imported into PocketBase. Every location lookup is a local DB query (~1ms). Haversine for distance calc. Bounding-box pre-filter + distance sort. |
| Reverse proxy | **Caddy** | Automatic HTTPS, serves static files, proxies `/api/*` and `/_/*` to PocketBase. |
| Hosting | **Hetzner CX23** | €4.15/mo, 2 vCPU, 4GB RAM, 40GB NVMe. Production target. |
| Search | **SQLite FTS5** (built into PocketBase) + client-side JS cache | |

### What is NOT in this stack
- No Docker
- No Node.js on the production server
- No PostgreSQL
- No Coolify or any PaaS layer
- No server-side rendering (static SvelteKit only)
- No Redis or external caching
- No Google Maps, Mapbox, or paid map APIs
- No external geocoding API dependency (postcodes.io, etc.) — postcode data is local

---

## PocketBase Collections (Database Schema)

### `users` (extends PocketBase built-in auth collection)
PocketBase provides a built-in `users` auth collection. Extend it with:
- `role` (select: `musician`, `organisation`) — required. Admin users are handled via PocketBase's built-in superuser, not this field.
- `display_name` (text) — required
- `location_lat` (number) — optional
- `location_lng` (number) — optional
- `postcode` (text) — optional
- `bio` (text) — optional
- `avatar` (file) — optional

### `postcodes` (ONS Postcode Directory)
Every live UK postcode with coordinates. Imported once from the ONS Postcode Directory CSV (~1.7M rows, adds ~50MB to SQLite). This eliminates all external geocoding API calls for postcode lookups.
- `postcode` (text, indexed) — normalized format, e.g. `"GU9 7AH"`
- `lat` (number)
- `lng` (number)

**Access rules:**
- List/View: everyone (public read-only)
- Create/Update/Delete: admin only

**Import:** One-time script reads the ONS CSV and bulk-inserts into PocketBase via the Admin API. See "Development Setup" section.

### `places` (OS Open Names)
UK place names (towns, cities, villages, localities) with coordinates. Imported from the OS Open Names dataset (free Ordnance Survey open data). This lets users search by place name (e.g. "Farnham", "London") without any external API call.
- `name` (text, indexed) — place name, e.g. `"Farnham"`
- `type` (text) — e.g. `"Town"`, `"City"`, `"Village"`, `"Suburb"`
- `lat` (number)
- `lng` (number)
- `county` (text, optional)

**Access rules:**
- List/View: everyone (public read-only)
- Create/Update/Delete: admin only

**Import:** One-time script, same pattern as postcodes. Filter to populated places only (towns, cities, villages, suburbs) to keep the collection small (~30K–50K rows).

### `organisations`
- `user` (relation → users) — required, one-to-one with the user account
- `name` (text) — required
- `description` (editor/rich text) — required
- `website` (url) — optional
- `social_links` (json) — optional, e.g. `{"facebook": "...", "twitter": "..."}`
- `verified` (bool) — default false, set by admin
- `addresses` (json) — array of `{label, street, city, postcode, lat, lng}`, supports multiple locations
- `created` (auto)
- `updated` (auto)

**Access rules:**
- List/View: everyone
- Create: authenticated users with role=organisation
- Update: only the owning user OR admin
- Delete: only admin

### `opportunities`
- `organisation` (relation → organisations) — required
- `title` (text) — required
- `description` (editor/rich text) — required
- `type` (select: `Classes`, `Ensemble`, `Workshop`, `Performance`, `Lessons`, `Project`) — required. The category of opportunity, each with a map marker icon.
- `instruments` (text) — optional, freeform (e.g. `"Guitar, Piano"` or `"Any"`)
- `age_group` (text) — optional, freeform (e.g. `"5-11"`, `"18+"`, `"All Ages"`)
- `website` (url) — optional, link to the opportunity's own page
- `location_name` (text) — human-readable location, required
- `location_lat` (number) — required for geo search
- `location_lng` (number) — required for geo search
- `postcode` (text) — required
- `expires_at` (date) — optional, opportunity auto-hidden after this date
- `created` (auto)
- `updated` (auto)

**Access rules:**
- List/View: everyone (opportunities are immediately visible once created)
- Create: authenticated users whose related organisation has `verified = true`
- Update: only the organisation owner OR admin
- Delete: only the organisation owner OR admin

### `profiles` (optional — for musician-specific data)
- `user` (relation → users) — required
- `instruments` (select, multiple) — what they play
- `age` (number) — optional
- `experience_level` (select: `beginner`, `intermediate`, `advanced`, `professional`) — optional
- `interests` (text) — optional
- `notifications_enabled` (bool) — default true

**Access rules:**
- View: only the owning user OR admin
- Create/Update: only the owning user
- Delete: only admin

---

## Frontend Structure (SvelteKit)

### Configuration
```js
// svelte.config.js
import adapter from '@sveltejs/adapter-static';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html' // SPA fallback for client-side routing
    })
  }
};
```

### Route Structure
```
src/
├── lib/
│   ├── pocketbase.js          # PocketBase client singleton
│   ├── cache.js                # Client-side search cache (see below)
│   ├── geo.js                  # Haversine distance calculation
│   ├── stores/
│   │   ├── auth.js             # Auth state store
│   │   ├── filters.js          # Search/filter state (query, type, proximity)
│   │   └── search.js           # Search state + cached results
│   └── components/
│       ├── LeafletMap.svelte   # Interactive Leaflet map with markers + popups
│       ├── OpportunityCard.svelte
│       ├── SearchFilters.svelte # Text search + type dropdown + postcode proximity
│       ├── OrgBadge.svelte     # Verified badge for organisations
│       ├── Navbar.svelte
│       ├── Footer.svelte
│       └── Pagination.svelte
├── routes/
│   ├── +layout.svelte          # Global layout (navbar, footer, auth check)
│   ├── +page.svelte            # Landing page — explains 3 user types
│   ├── search/
│   │   └── +page.svelte        # Musician search page with filters
│   ├── opportunity/
│   │   └── [id]/
│   │       └── +page.svelte    # Single opportunity detail page
│   ├── dashboard/
│   │   ├── +layout.svelte      # Auth guard — redirect if not logged in
│   │   ├── +page.svelte        # Dashboard home (role-based redirect)
│   │   ├── opportunities/
│   │   │   ├── +page.svelte    # Org: list own opportunities
│   │   │   ├── new/
│   │   │   │   └── +page.svelte # Org: create new opportunity
│   │   │   └── [id]/
│   │   │       └── edit/
│   │   │           └── +page.svelte # Org: edit opportunity
│   │   └── organisation/
│   │       └── +page.svelte    # Org: edit profile, view verification status
│   ├── auth/
│   │   ├── login/
│   │   │   └── +page.svelte
│   │   ├── register/
│   │   │   └── +page.svelte    # Register with role selection
│   │   └── reset-password/
│   │       └── +page.svelte
│   └── advice/
│       └── +page.svelte        # Static advice page for musicians
```

### PocketBase Client Setup
```js
// src/lib/pocketbase.js
import PocketBase from 'pocketbase';

const pb = new PocketBase('https://yoursite.com');
// In development: new PocketBase('http://127.0.0.1:8090');

export default pb;
```

Use the environment-appropriate URL. In development, PocketBase runs locally. In production, Caddy proxies `/api/*` to PocketBase.

---

## Leaflet Map Integration

The interactive map is the primary search UI. Leaflet is used directly in Svelte (no wrapper library).

### Setup pattern:
```svelte
<!-- src/lib/components/LeafletMap.svelte -->
<script>
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';

  let mapElement;
  let map;

  onMount(() => {
    map = L.map(mapElement).setView([54.5, -2], 6); // Center of UK
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);
  });

  onDestroy(() => { if (map) map.remove(); });
</script>

<div bind:this={mapElement} style="height: 100%; width: 100%;"></div>
```

### Map defaults:
- Center: `[54.5, -2]` (center of UK), zoom: `6` (shows full UK)
- FlyTo on selection: zoom `13`, duration `0.8s`

### Markers:
- One marker per opportunity with coordinates
- Click marker → popup with title, type, location name
- Future enhancement: custom icons per opportunity `type`, linked hover with table

### Proximity circle:
When a user searches by postcode, show a `L.circle()` overlay at the resolved coordinates with the selected search radius.

---

## Client-Side Search Cache

Implement an in-memory cache for API responses. This avoids redundant PocketBase calls when users navigate back to search results or repeat similar searches.

```js
// src/lib/cache.js
const cache = new Map();
const DEFAULT_TTL = 60000; // 60 seconds

export function getCached(key) {
  if (!cache.has(key)) return null;
  const { data, timestamp, ttl } = cache.get(key);
  if (Date.now() - timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return data;
}

export function setCache(key, data, ttl = DEFAULT_TTL) {
  // Limit cache size to prevent memory bloat
  if (cache.size > 100) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

export function clearCache() {
  cache.clear();
}

export function cacheKey(prefix, params) {
  return prefix + ':' + JSON.stringify(params);
}
```

### Usage in search:
```js
import { getCached, setCache, cacheKey } from '$lib/cache.js';
import pb from '$lib/pocketbase.js';

async function searchOpportunities(filters) {
  const key = cacheKey('search', filters);
  const cached = getCached(key);
  if (cached) return cached;

  const result = await pb.collection('opportunities').getList(1, 20, {
    filter: buildFilterString(filters),
    expand: 'organisation',
    sort: '-created'
  });

  setCache(key, result);
  return result;
}
```

---

## Geo Search (Haversine)

```js
// src/lib/geo.js

// Calculate distance between two lat/lng points in kilometers
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // Round to 1 decimal
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

// Create a bounding box for pre-filtering (faster than calculating distance for every record)
export function boundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos(toRad(lat)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta
  };
}
```

### Geo search flow:
1. User enters a location (could be a postcode like `"GU9 7AH"` or a place name like `"Farnham"`)
2. Detect if input looks like a UK postcode (regex: `/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i`)
   - **If postcode:** query the local `postcodes` collection → instant lat/lng (~1ms)
   - **If place name:** query the local `places` collection (`name ~ "Farnham"`) → instant lat/lng (~1ms)
3. Calculate bounding box for the desired radius
4. Query PocketBase with filter: `location_lat >= minLat && location_lat <= maxLat && location_lng >= minLng && location_lng <= maxLng`
5. Client-side: calculate actual Haversine distance for each result and sort by proximity
6. Cache the results

**Both lookups are local.** Postcodes come from the ONS Postcode Directory, place names from OS Open Names — both free UK government data, both imported into PocketBase. Every search resolves in ~1ms with zero network calls, zero rate limits, and zero external dependencies.

---

## Synthetic Demo Data

For the skeleton app, seed PocketBase with a handful of synthetic opportunities via the admin UI (`/_/`). No data import scripts needed yet. Example records:

| title | type | location_name | postcode | lat | lng | age_group | instruments |
|-------|------|---------------|----------|-----|-----|-----------|-------------|
| Farnham Youth Guitar Workshop | Workshop | Farnham Maltings, Farnham | GU9 7QR | 51.214 | -0.799 | 8-16 | Guitar |
| Bristol Community Choir | Ensemble | St George's, Bristol | BS1 5RR | 51.454 | -2.597 | 18+ | Voice |
| London Piano Masterclass | Classes | Royal Academy, London | W1B 1BS | 51.518 | -0.144 | All Ages | Piano |
| Brighton Jazz Ensemble | Ensemble | The Old Market, Brighton | BN1 1NF | 50.829 | -0.137 | 14+ | Saxophone, Trumpet |
| Manchester Drum Lessons | Lessons | Band on the Wall, Manchester | M4 5JZ | 53.485 | -2.236 | 5-11 | Drums |
| Edinburgh Youth Orchestra | Performance | Usher Hall, Edinburgh | EH1 2EA | 55.947 | -3.207 | 11-18 | Any |

Create one synthetic organisation (e.g. "Demo Music Trust", verified=true) and link all demo opportunities to it. This gives enough data to test the map, filters, and search.

---

## Data Export (Admin Feature)

For the skeleton, CSV export is handled via PocketBase's built-in admin UI (`/_/`) — the admin (Nathan) can export any collection to CSV directly. No custom UI needed.

**Future enhancement:** If self-serve data access is required for researchers/academics, add a dedicated `researcher` role and a `/dashboard/data` route that fetches published opportunities and generates CSV client-side.

---

## Organisation Verification Flow

1. User registers with role = `organisation`
2. User fills out organisation profile (name, description, addresses)
3. Admin reviews in PocketBase admin UI (`/_/`) — confirms legitimacy via out-of-band check (email, phone, DBS/charity registration), then sets `verified = true`
4. Until verified, organisation CANNOT create opportunities (enforced via PocketBase access rules)
5. Verified badge appears on the organisation's public profile

The verification is manual — Nathan reviews each organisation through PocketBase's built-in admin dashboard. This is intentional for child safeguarding. Do NOT automate this.

**Future enhancement:** Add a `verification_documents` (file, multiple) field for orgs to upload DBS certificates / charity registration during signup. For the skeleton, verification is done out-of-band.

---

## Authentication

Use PocketBase's built-in auth system:
- Email/password registration with email verification
- OAuth providers (Google, optionally) — configure in PocketBase admin
- Password reset via email
- Session management via PocketBase SDK (uses cookies/localStorage)

### Auth store in SvelteKit:
```js
// src/lib/stores/auth.js
import { writable } from 'svelte/store';
import pb from '$lib/pocketbase.js';

export const currentUser = writable(pb.authStore.model);

pb.authStore.onChange((token, model) => {
  currentUser.set(model);
});
```

### Auth guard for dashboard:
```svelte
<!-- src/routes/dashboard/+layout.svelte -->
<script>
  import { currentUser } from '$lib/stores/auth.js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    if (!$currentUser) {
      goto('/auth/login');
    }
  });
</script>

{#if $currentUser}
  <slot />
{/if}
```

---

## Design & Styling

Use **Tailwind CSS** for styling. Install via:
```bash
npx svelte-add@latest tailwind
```

Design principles:
- Clean, modern, accessible (WCAG AA minimum)
- Mobile-first responsive design
- The landing page should clearly explain the two user types (musicians, organisations) with distinct calls-to-action
- Search page: interactive Leaflet map with a filter bar (text search, type dropdown, postcode + radius proximity) and results as cards
- Organisation dashboard: simple CRUD table/list for their opportunities
- Verified organisations show a trust badge
- Use a professional but warm color palette suitable for a music/arts context

---

## Caddy Configuration (Production)

```
yoursite.com {
    # PocketBase API and admin
    handle /api/* {
        reverse_proxy localhost:8090
    }
    handle /_/* {
        reverse_proxy localhost:8090
    }

    # SvelteKit static files
    handle {
        root * /var/www/site
        try_files {path} /index.html
        file_server
    }

    # Cache static assets
    @static path *.js *.css *.png *.jpg *.svg *.woff2 *.ico
    header @static Cache-Control "public, max-age=31536000, immutable"
}
```

---

## Development Setup

### Local development:
1. Download PocketBase binary for your OS
2. Run: `./pocketbase serve` (starts on localhost:8090)
3. Open `localhost:8090/_/` to set up admin account and create collections
4. Import ONS Postcode Directory into `postcodes` collection (one-time, ~1.7M rows) and OS Open Names into `places` collection (~30K–50K rows)
5. Seed a few synthetic demo opportunities via the admin UI (see "Synthetic Demo Data" section)
6. In a second terminal: `npm run dev` (SvelteKit dev server on localhost:5173)
7. In development, point the PocketBase client at `http://127.0.0.1:8090`

**Note:** Leaflet CSS must be imported in your map component: `import 'leaflet/dist/leaflet.css'`

### Production deployment:
1. Build SvelteKit: `npm run build`
2. Upload: `rsync -avz build/ user@server:/var/www/site/`
3. PocketBase and Caddy are already running as systemd services
4. Static file changes are served immediately by Caddy (no restart needed)
5. PocketBase schema changes: use PocketBase admin at `yoursite.com/_/`

---

## Essential Security

- PocketBase access rules enforce all authorization (not just frontend guards)
- CORS configured in PocketBase settings to allow only your domain
- Caddy provides automatic HTTPS
- On VPS: ufw firewall (allow 80, 443, 22 only), fail2ban for SSH, unattended-upgrades
- Never expose PocketBase port 8090 directly — always through Caddy
- Rate limiting: Caddy can add basic rate limiting via plugins if needed

---

## Backup Strategy

Daily cron job on the VPS:
```bash
# /etc/cron.d/pocketbase-backup
0 3 * * * root cp -r /opt/pocketbase/pb_data /opt/backups/pb_data_$(date +\%Y\%m\%d) && find /opt/backups -mtime +7 -delete
```

This copies the entire PocketBase data directory (database + uploaded files) daily at 3 AM and keeps 7 days of backups. For off-site backup, rsync to a second server or Hetzner Object Storage.

---

## What NOT to Build (Out of Scope for MVP)

- Bulk data import from CSV/KML — skeleton uses synthetic demo data; real data migration comes later
- User-facing bulk opportunity import (Quizlet-style) — add later
- Email notifications for matching opportunities — add later
- Real-time subscriptions/live updates — add later
- Dedicated researcher role/dashboard — admin exports data via PocketBase admin UI for now
- Statistical charts/analytics dashboards — out of scope for skeleton
- Mobile app — the responsive web app is sufficient
- Social login beyond Google — add later
- Advanced admin dashboard — PocketBase's built-in admin is sufficient
- Payment/subscription system — not needed
- Map clustering, heatmaps, or route planning — add later
- Custom marker icons per type — add later (start with default Leaflet markers)

---

## Summary

This is a two-process production stack:
- **Caddy** (reverse proxy + HTTPS + static files)
- **PocketBase** (database + auth + API + file storage + admin + local postcode geocoding)

The interactive **Leaflet map** is the primary UI for musicians discovering opportunities. All frontend logic runs in the browser. No server-side rendering. No Docker. No Node.js on the server. No external API dependencies for geocoding. SvelteKit compiles to static files at build time.

Total VPS RAM usage: ~150MB. Total 6-month hosting cost: €25.
