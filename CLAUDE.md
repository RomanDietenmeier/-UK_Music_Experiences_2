# CLAUDE.md — Music Opportunities Platform (Nathan's Project)

## Project Overview

Build a music opportunities platform for the UK connecting three user groups:
- **Musicians** search for opportunities by instrument, age group, and location
- **Organisations** post, manage, and edit opportunities
- **Researchers** view aggregated data and export CSV

The platform is based in Farnham, UK. Child safeguarding and GDPR compliance are critical requirements.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Backend/DB/Auth/API | **PocketBase** | Single Go binary. SQLite, built-in auth, REST API, admin UI, file storage. Runs on port 8090. |
| Frontend | **SvelteKit** (static adapter) | Compiles to static HTML/CSS/JS. No Node.js on production server. All API calls happen client-side via PocketBase JS SDK. |
| Reverse proxy | **Caddy** | Automatic HTTPS, serves static files, proxies `/api/*` and `/_/*` to PocketBase. |
| Hosting | **Hetzner CX23** | €4.15/mo, 2 vCPU, 4GB RAM, 40GB NVMe. Production target. |
| Search | **SQLite FTS5** (built into PocketBase) + client-side JS cache | |
| Geo | **Haversine formula** in application code | No PostGIS. Bounding-box pre-filter + distance sort. |

### What is NOT in this stack
- No Docker
- No Node.js on the production server
- No PostgreSQL
- No Coolify or any PaaS layer
- No server-side rendering (static SvelteKit only)
- No Redis or external caching

---

## PocketBase Collections (Database Schema)

### `users` (extends PocketBase built-in auth collection)
PocketBase provides a built-in `users` auth collection. Extend it with:
- `role` (select: `musician`, `organisation`, `researcher`, `admin`) — required
- `display_name` (text) — required
- `location_lat` (number) — optional
- `location_lng` (number) — optional
- `postcode` (text) — optional
- `bio` (text) — optional
- `avatar` (file) — optional

### `organisations`
- `user` (relation → users) — required, one-to-one with the user account
- `name` (text) — required
- `description` (editor/rich text) — required
- `website` (url) — optional
- `social_links` (json) — optional, e.g. `{"facebook": "...", "twitter": "..."}`
- `verified` (bool) — default false, set by admin
- `verification_documents` (file, multiple) — uploaded by org during registration
- `addresses` (json) — array of `{label, street, city, postcode, lat, lng}`, supports multiple locations
- `created` (auto)
- `updated` (auto)

**Access rules:**
- List/View: everyone (but hide `verification_documents` from non-admin)
- Create: authenticated users with role=organisation
- Update: only the owning user OR admin
- Delete: only admin

### `opportunities`
- `organisation` (relation → organisations) — required
- `title` (text) — required
- `description` (editor/rich text) — required
- `instruments` (select, multiple) — e.g. `["violin", "guitar", "piano", "voice", "drums", "flute", "cello", "trumpet", "saxophone", "clarinet", "any"]`
- `age_min` (number) — minimum age, optional (null = no minimum)
- `age_max` (number) — maximum age, optional (null = no maximum)
- `location_name` (text) — human-readable location, required
- `location_lat` (number) — required for geo search
- `location_lng` (number) — required for geo search
- `postcode` (text) — required
- `participant_limit` (number) — optional, 0 or null = unlimited
- `current_participants` (number) — default 0
- `expires_at` (date) — required, opportunity auto-hidden after this date
- `starts_at` (date) — optional, when the opportunity begins
- `recurring` (bool) — default false
- `location_restricted` (bool) — default false, if true only users in certain area can participate
- `location_restriction_radius_km` (number) — optional, radius in km for location restriction
- `status` (select: `draft`, `published`, `archived`) — default `draft`
- `created` (auto)
- `updated` (auto)

**Access rules:**
- List/View: everyone can see opportunities where `status = "published"` and `expires_at > now`
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
│   │   └── search.js           # Search state + cached results
│   └── components/
│       ├── OpportunityCard.svelte
│       ├── SearchFilters.svelte
│       ├── MapEmbed.svelte     # Simple map showing opportunity location
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
│   │   ├── organisation/
│   │   │   └── +page.svelte    # Org: edit profile, view verification status
│   │   └── data/
│   │       └── +page.svelte    # Researcher: data view + CSV export
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
1. Get user's location (postcode → lat/lng via free API like postcodes.io)
2. Calculate bounding box for the desired radius
3. Query PocketBase with filter: `location_lat >= minLat && location_lat <= maxLat && location_lng >= minLng && location_lng <= maxLng`
4. Client-side: calculate actual Haversine distance for each result and sort by proximity
5. Cache the results

Use https://postcodes.io (free, no API key needed) for UK postcode → lat/lng conversion.

---

## CSV Export (Researcher Feature)

The researcher dashboard should:
1. Fetch all published opportunities (paginated, fetch all pages)
2. Allow filtering by date range, region, instrument, age group
3. Generate CSV client-side using a simple function:

```js
function exportToCSV(data, filename) {
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        // Escape commas and quotes
        return typeof val === 'string' && (val.includes(',') || val.includes('"'))
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(',')
    )
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## Organisation Verification Flow

1. User registers with role = `organisation`
2. User fills out organisation profile (name, description, addresses)
3. User uploads verification documents (DBS certificates, charity registration, etc.)
4. Admin reviews in PocketBase admin UI (`/_/`) — sets `verified = true`
5. Until verified, organisation CANNOT create opportunities (enforced via PocketBase access rules)
6. Verified badge appears on the organisation's public profile

The verification is manual — Nathan reviews each organisation through PocketBase's built-in admin dashboard. This is intentional for child safeguarding. Do NOT automate this.

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
- The landing page should clearly explain the three user types (musicians, organisations, researchers) with distinct calls-to-action
- Search page: prominent filter bar (instrument, age, location/radius) with results as cards
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
4. In a second terminal: `npm run dev` (SvelteKit dev server on localhost:5173)
5. In development, point the PocketBase client at `http://127.0.0.1:8090`

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

- Bulk opportunity import (Quizlet-style) — add later
- Email notifications for matching opportunities — add later
- Real-time subscriptions/live updates — add later
- Statistical charts for researchers — MVP is CSV export only
- Mobile app — the responsive web app is sufficient
- Social login beyond Google — add later
- Advanced admin dashboard — PocketBase's built-in admin is sufficient
- Payment/subscription system — not needed

---

## Summary

This is a two-process production stack:
- **Caddy** (reverse proxy + HTTPS + static files)
- **PocketBase** (database + auth + API + file storage + admin)

All frontend logic runs in the browser. No server-side rendering. No Docker. No Node.js on the server. SvelteKit compiles to static files at build time.

Total VPS RAM usage: ~150MB. Total 6-month hosting cost: €25.
