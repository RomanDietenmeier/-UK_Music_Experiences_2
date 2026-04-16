// scripts/seed.mjs
//
// Creates PocketBase collections (postcodes, places) and bulk-imports CSV data.
//
// Usage:
//   PB_URL=http://127.0.0.1:8090 PB_EMAIL=you@example.com PB_PASSWORD=secret node scripts/seed.mjs
//
// Or create a .env file with the same variables (auto-loaded).

import PocketBase from 'pocketbase';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- Tiny .env loader (no external dep) -----------------------------------
function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, k, v] = m;
    if (!(k in process.env)) {
      process.env[k] = v.replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const PB_EMAIL = process.env.PB_EMAIL;
const PB_PASSWORD = process.env.PB_PASSWORD;

if (!PB_EMAIL || !PB_PASSWORD) {
  console.error(
    '❌  Missing PB_EMAIL or PB_PASSWORD.\n' +
    '   Set them as env vars or create a .env file at the project root:\n\n' +
    '   PB_URL=http://127.0.0.1:8090\n' +
    '   PB_EMAIL=you@example.com\n' +
    '   PB_PASSWORD=your-admin-password\n'
  );
  process.exit(1);
}

// --- Config ---------------------------------------------------------------
const POSTCODES_CSV = resolve(ROOT, 'data_exports', 'postcodes.csv');
const PLACES_CSV = resolve(ROOT, 'data_exports', 'places.csv');

// PocketBase batch API: up to N requests per batch call, with multiple batches in flight.
// The server must have batch enabled (admin UI → Settings → Batch API).
const BATCH_SIZE = 50;
const CONCURRENCY = 10;

// --- Helpers --------------------------------------------------------------
function parseCSVLine(line) {
  // Simple split — our exports don't contain embedded commas or quotes.
  return line.split(',');
}

// System fields we must never delete from PocketBase collections.
// Auth collections have more built-ins than base ones.
const SYSTEM_FIELDS = new Set([
  'id', 'created', 'updated',
  'email', 'emailVisibility', 'verified', 'tokenKey', 'password' // auth
]);

function systemFieldsFor(collectionType) {
  const s = new Set(['id', 'created', 'updated']);
  if (collectionType === 'auth') {
    for (const n of ['email', 'emailVisibility', 'verified', 'tokenKey', 'password']) s.add(n);
  }
  return s;
}

async function resolveRelations(pb, fields) {
  // Convert { _relatesTo: 'users' } → { collectionId: '<users-id>' } in-place on a clone.
  const out = [];
  for (const f of fields) {
    if (f.type === 'relation' && f._relatesTo) {
      const target = await pb.collections.getOne(f._relatesTo);
      const { _relatesTo, ...rest } = f;
      out.push({ ...rest, collectionId: target.id });
    } else {
      out.push(f);
    }
  }
  return out;
}

async function ensureCollection(pb, schema) {
  console.log(`  > ensure collection "${schema.name}"`);
  // Resolve relation targets first (they need PocketBase collection IDs, not names)
  const resolvedFields = await resolveRelations(pb, schema.fields);
  schema = { ...schema, fields: resolvedFields };

  let existing = null;
  try {
    existing = await pb.collections.getOne(schema.name);
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  if (!existing) {
    await pb.collections.create(schema);
    console.log(`  ✓ created collection "${schema.name}"`);
    return;
  }

  // Reconcile: add missing fields, remove extras, patch mismatched required flags.
  const actual = existing.fields || existing.schema || [];
  const actualByName = Object.fromEntries(actual.map((f) => [f.name, f]));
  const wantedNames = new Set(schema.fields.map((f) => f.name));
  const systemFields = systemFieldsFor(existing.type);

  const merged = [];
  let changes = [];

  // Keep system fields as-is, but strip any computed/server-only props that
  // PocketBase does not accept on write (like `collectionName`).
  function cleanField(f) {
    const { collectionName, ...rest } = f;
    return rest;
  }

  for (const f of actual) {
    if (systemFields.has(f.name)) merged.push(cleanField(f));
  }

  // Add/update wanted fields
  for (const wanted of schema.fields) {
    const prev = actualByName[wanted.name];
    if (!prev) {
      merged.push(wanted);
      changes.push(`added field "${wanted.name}"`);
      continue;
    }

    // Never send a type change — PocketBase rejects it. Warn instead.
    if (prev.type !== wanted.type) {
      console.log(`  ⚠ field "${wanted.name}" has type "${prev.type}" but schema expects "${wanted.type}".`);
      console.log(`    PocketBase does not allow type changes via update — delete + recreate the field manually.`);
      merged.push(cleanField(prev)); // keep as-is
      continue;
    }

    // Preserve prev entirely, only override the properties we actually care about.
    const updated = cleanField(prev);
    const patchKeys = ['required', 'max', 'min', 'maxSelect', 'minSelect', 'values', 'presentable', 'unique'];
    for (const k of patchKeys) {
      if (wanted[k] !== undefined && JSON.stringify(updated[k]) !== JSON.stringify(wanted[k])) {
        updated[k] = wanted[k];
        changes.push(`changed ${k} of "${wanted.name}": ${JSON.stringify(prev[k])} → ${JSON.stringify(wanted[k])}`);
      }
    }
    merged.push(updated);
  }

  // Report removed extras (everything in actual that's not system and not wanted)
  for (const f of actual) {
    if (!systemFields.has(f.name) && !wantedNames.has(f.name)) {
      changes.push(`removed extra field "${f.name}"`);
    }
  }

  if (changes.length === 0) {
    console.log(`  ✓ collection "${schema.name}" already matches`);
    return;
  }

  const patch = {
    fields: merged,
    listRule: schema.listRule ?? existing.listRule,
    viewRule: schema.viewRule ?? existing.viewRule,
    createRule: schema.createRule ?? existing.createRule,
    updateRule: schema.updateRule ?? existing.updateRule,
    deleteRule: schema.deleteRule ?? existing.deleteRule
  };
  if (schema.indexes) patch.indexes = schema.indexes;

  await pb.collections.update(existing.id, patch);
  console.log(`  ✓ updated collection "${schema.name}":`);
  for (const c of changes) console.log(`      - ${c}`);
}

function exitBatchRequired(reason) {
  console.error(`\n❌  Batch API not available: ${reason}`);
  console.error(
    '\n    Enable it in the PocketBase admin UI:\n' +
    '      1. Open http://127.0.0.1:8090/_/\n' +
    '      2. Settings → Batch API\n' +
    '      3. Enable, set "Max requests per batch" to at least 50, save\n' +
    '      4. Re-run `npm run seed`\n'
  );
  process.exit(1);
}

function isBatchDisabledError(err) {
  const status = err.status || err.response?.status;
  const msg = err.message || '';
  // 403: "Batch requests are not allowed." — the exact error when batch is disabled.
  return status === 403 && /batch requests are not allowed/i.test(msg);
}

async function sendBatch(pb, collection, records) {
  if (typeof pb.createBatch !== 'function') {
    exitBatchRequired('installed pocketbase SDK is too old (no createBatch).');
  }
  try {
    const batch = pb.createBatch();
    for (const data of records) {
      batch.collection(collection).create(data);
    }
    await batch.send();
  } catch (err) {
    if (isBatchDisabledError(err)) exitBatchRequired(err.message);
    throw err;
  }
}

async function streamImport(pb, { csvPath, collection, mapRow, label }) {
  if (!existsSync(csvPath)) {
    console.error(`❌  Missing file: ${csvPath}`);
    console.error(`    Run the Jupyter notebook (ons_postcode_extraction.ipynb) first.`);
    process.exit(1);
  }

  // How many records are already in PocketBase? Makes the script resumable.
  const existing = await pb.collection(collection).getList(1, 1, { fields: 'id' });
  const alreadyInDb = existing.totalItems;
  if (alreadyInDb > 0) {
    console.log(`\n→ Skipping first ${alreadyInDb.toLocaleString()} rows of ${label} (already in DB)`);
  }

  console.log(`→ Importing ${label} from ${csvPath}`);
  const stream = createReadStream(csvPath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let headers = null;
  let rowIdx = 0; // data-row index, 0-based
  let buffer = [];
  let inflight = new Set();
  let imported = 0;
  let firstError = null;
  const startedAt = Date.now();

  // Track inflight promises via a Set so we can drop settled ones without losing errors.
  function track(p) {
    inflight.add(p);
    p.then(
      () => inflight.delete(p),
      (err) => {
        if (!firstError) firstError = err;
        inflight.delete(p);
      }
    );
  }

  async function drain() {
    while (inflight.size > 0) {
      await Promise.race(inflight).catch(() => { });
    }
    if (firstError) throw firstError;
  }

  for await (const line of rl) {
    if (firstError) break;
    if (!line) continue;

    if (headers === null) {
      headers = parseCSVLine(line);
      continue;
    }

    const idx = rowIdx++;
    if (idx < alreadyInDb) continue; // resume: skip rows already in DB

    const cols = parseCSVLine(line);
    const row = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cols[i];

    const record = mapRow(row);
    if (!record) continue;

    buffer.push(record);

    if (buffer.length >= BATCH_SIZE) {
      const batchRecords = buffer;
      buffer = [];
      track(sendBatch(pb, collection, batchRecords).then(() => {
        imported += batchRecords.length;
        const secs = (Date.now() - startedAt) / 1000;
        const rate = imported / secs;
        process.stdout.write(
          `\r  ${imported.toLocaleString()} records (${rate.toFixed(0)}/sec)`
        );
      }));

      while (inflight.size >= CONCURRENCY && !firstError) {
        await Promise.race(inflight).catch(() => { });
      }
    }
  }

  // Flush remaining
  if (buffer.length > 0 && !firstError) {
    track(sendBatch(pb, collection, buffer).then(() => {
      imported += buffer.length;
    }));
  }
  await drain();

  const secs = (Date.now() - startedAt) / 1000;
  console.log(
    `\n  ✓ imported ${imported.toLocaleString()} ${label} in ${secs.toFixed(1)}s ` +
    `(${(imported / secs).toFixed(0)}/sec)`
  );
}

// --- Schema definitions ---------------------------------------------------
const POSTCODES_SCHEMA = {
  name: 'postcodes',
  type: 'base',
  listRule: '',       // public read
  viewRule: '',       // public read
  createRule: null,   // admin only
  updateRule: null,
  deleteRule: null,
  fields: [
    { name: 'postcode', type: 'text', required: true, max: 10 },
    { name: 'lat', type: 'number', required: true },
    { name: 'lng', type: 'number', required: true }
  ],
  indexes: [
    'CREATE INDEX idx_postcodes_postcode ON postcodes (postcode)'
  ]
};

const PLACES_SCHEMA = {
  name: 'places',
  type: 'base',
  listRule: '',
  viewRule: '',
  createRule: null,
  updateRule: null,
  deleteRule: null,
  fields: [
    { name: 'name', type: 'text', required: true, max: 200 },
    { name: 'source', type: 'text', required: false, max: 50 },
    { name: 'lat', type: 'number', required: true },
    { name: 'lng', type: 'number', required: true },
    { name: 'count', type: 'number', required: false }
  ],
  indexes: [
    'CREATE INDEX idx_places_name ON places (name)'
  ]
};

// Users is PocketBase's built-in auth collection. We just add custom fields.
const USERS_SCHEMA = {
  name: 'users',
  type: 'auth',
  fields: [
    { name: 'role', type: 'select', required: true, maxSelect: 1, values: ['musician', 'organisation'] },
    { name: 'display_name', type: 'text', required: true, max: 100 }
  ]
};

// Relation targets are resolved by collection name at runtime (see main()).
const ORGANISATIONS_SCHEMA = {
  name: 'organisations',
  type: 'base',
  listRule: '',      // public read
  viewRule: '',
  createRule: "@request.auth.id != '' && @request.auth.role = 'organisation'",
  updateRule: "@request.auth.id = user.id",
  deleteRule: null,  // admin only
  fields: [
    { name: 'user', type: 'relation', required: true, maxSelect: 1, _relatesTo: 'users' },
    { name: 'name', type: 'text', required: true, max: 200 },
    { name: 'description', type: 'editor', required: false },
    { name: 'verified', type: 'bool', required: false }
  ]
};

const OPPORTUNITIES_SCHEMA = {
  name: 'opportunities',
  type: 'base',
  listRule: '',
  viewRule: '',
  createRule: "@request.auth.id != '' && organisation.verified = true && organisation.user.id = @request.auth.id",
  updateRule: "organisation.user.id = @request.auth.id",
  deleteRule: "organisation.user.id = @request.auth.id",
  fields: [
    { name: 'organisation', type: 'relation', required: true, maxSelect: 1, _relatesTo: 'organisations' },
    { name: 'title', type: 'text', required: true, max: 200 },
    { name: 'description', type: 'editor', required: true },
    {
      name: 'type', type: 'select', required: true, maxSelect: 1,
      values: ['Classes', 'Ensemble', 'Workshop', 'Performance', 'Lessons', 'Project']
    },
    { name: 'instruments', type: 'text', required: false, max: 500 },
    { name: 'age_group', type: 'text', required: false, max: 100 },
    { name: 'website', type: 'url', required: false },
    { name: 'location_name', type: 'text', required: true, max: 300 },
    { name: 'location_lat', type: 'number', required: true },
    { name: 'location_lng', type: 'number', required: true },
    { name: 'postcode', type: 'text', required: true, max: 10 },
    { name: 'expires_at', type: 'date', required: false }
  ],
  indexes: [
    'CREATE INDEX idx_opportunities_type ON opportunities (type)',
    'CREATE INDEX idx_opportunities_postcode ON opportunities (postcode)'
  ]
};

// --- Main -----------------------------------------------------------------
async function main() {
  const pb = new PocketBase(PB_URL);
  // Disable auto-cancellation so concurrent inserts don't cancel each other.
  pb.autoCancellation(false);

  console.log(`Connecting to PocketBase at ${PB_URL} as ${PB_EMAIL}...`);
  try {
    await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
  } catch (err) {
    // Newer PocketBase (v0.23+) uses _superusers auth collection instead of admins API
    try {
      await pb.collection('_superusers').authWithPassword(PB_EMAIL, PB_PASSWORD);
    } catch {
      console.error(`❌  Auth failed: ${err.message}`);
      console.error(`    Check PB_EMAIL / PB_PASSWORD. This script needs a superuser/admin.`);
      process.exit(1);
    }
  }
  console.log('  ✓ authenticated');

  console.log('\n→ Ensuring collections exist...');
  // Order matters: relations must point to existing collections.
  await ensureCollection(pb, OPPORTUNITIES_SCHEMA);
  await ensureCollection(pb, ORGANISATIONS_SCHEMA);
  await ensureCollection(pb, PLACES_SCHEMA);
  await ensureCollection(pb, POSTCODES_SCHEMA);
  await ensureCollection(pb, USERS_SCHEMA);

  await streamImport(pb, {
    csvPath: POSTCODES_CSV,
    collection: 'postcodes',
    label: 'postcodes',
    mapRow: (row) => ({
      postcode: row.postcode,
      lat: Number(row.lat),
      lng: Number(row.lng)
    })
  });

  await streamImport(pb, {
    csvPath: PLACES_CSV,
    collection: 'places',
    label: 'places',
    mapRow: (row) => ({
      name: row.name,
      source: row.source || '',
      lat: Number(row.lat),
      lng: Number(row.lng),
      count: row.count ? Number(row.count) : 0
    })
  });

  console.log('\n✓ Done.');
}

main().catch((err) => {
  console.error('\n❌  Error:', err.message);
  if (err.response) console.error('    Response:', JSON.stringify(err.response, null, 2));
  process.exit(1);
});
