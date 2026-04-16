// scripts/setup.mjs
//
// Production-safe database setup:
//   1. Creates / reconciles all PocketBase collections (users, organisations,
//      opportunities, postcodes, places) to match CLAUDE.md.
//   2. Bulk-imports postcodes.csv and places.csv (idempotent, resumable).
//
// Run once on a fresh database, or any time you want to sync the schema.
// Safe to re-run — it's idempotent.
//
// Usage: npm run setup

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { ROOT, connect, runMain } from './_common.mjs';

// --- Config ---------------------------------------------------------------
const POSTCODES_CSV = resolve(ROOT, 'data_exports', 'postcodes.csv');
const PLACES_CSV = resolve(ROOT, 'data_exports', 'places.csv');

// PocketBase batch API: up to N requests per batch, with several batches in flight.
// The server must have batch enabled (admin UI → Settings → Batch API).
const BATCH_SIZE = 50;
const CONCURRENCY = 10;

// --- Helpers --------------------------------------------------------------
function parseCSVLine(line) {
  return line.split(',');
}

function systemFieldsFor(collectionType) {
  const s = new Set(['id', 'created', 'updated']);
  if (collectionType === 'auth') {
    for (const n of ['email', 'emailVisibility', 'verified', 'tokenKey', 'password']) s.add(n);
  }
  return s;
}

async function resolveRelations(pb, fields) {
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

  const actual = existing.fields || existing.schema || [];
  const actualByName = Object.fromEntries(actual.map((f) => [f.name, f]));
  const wantedNames = new Set(schema.fields.map((f) => f.name));
  const systemFields = systemFieldsFor(existing.type);

  const merged = [];
  const changes = [];

  function cleanField(f) {
    const { collectionName, ...rest } = f;
    return rest;
  }

  for (const f of actual) {
    if (systemFields.has(f.name)) merged.push(cleanField(f));
  }

  for (const wanted of schema.fields) {
    const prev = actualByName[wanted.name];
    if (!prev) {
      merged.push(wanted);
      changes.push(`added field "${wanted.name}"`);
      continue;
    }

    if (prev.type !== wanted.type) {
      console.log(`  ⚠ field "${wanted.name}" has type "${prev.type}" but schema expects "${wanted.type}".`);
      console.log(`    PocketBase does not allow type changes via update — delete + recreate manually.`);
      merged.push(cleanField(prev));
      continue;
    }

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
    '      4. Re-run `npm run setup`\n'
  );
  process.exit(1);
}

function isBatchDisabledError(err) {
  const status = err.status || err.response?.status;
  const msg = err.message || '';
  return status === 403 && /batch requests are not allowed/i.test(msg);
}

async function sendBatch(pb, collection, records) {
  if (typeof pb.createBatch !== 'function') {
    exitBatchRequired('installed pocketbase SDK is too old (no createBatch).');
  }
  try {
    const batch = pb.createBatch();
    for (const data of records) batch.collection(collection).create(data);
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

  const existing = await pb.collection(collection).getList(1, 1, { fields: 'id' });
  const alreadyInDb = existing.totalItems;
  if (alreadyInDb > 0) {
    console.log(`\n→ Skipping first ${alreadyInDb.toLocaleString()} rows of ${label} (already in DB)`);
  }

  console.log(`→ Importing ${label} from ${csvPath}`);
  const stream = createReadStream(csvPath, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let headers = null;
  let rowIdx = 0;
  let buffer = [];
  const inflight = new Set();
  let imported = 0;
  let firstError = null;
  const startedAt = Date.now();

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
    while (inflight.size > 0) await Promise.race(inflight).catch(() => {});
    if (firstError) throw firstError;
  }

  for await (const line of rl) {
    if (firstError) break;
    if (!line) continue;
    if (headers === null) { headers = parseCSVLine(line); continue; }

    const idx = rowIdx++;
    if (idx < alreadyInDb) continue;

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
        process.stdout.write(
          `\r  ${imported.toLocaleString()} records (${(imported / secs).toFixed(0)}/sec)`
        );
      }));

      while (inflight.size >= CONCURRENCY && !firstError) {
        await Promise.race(inflight).catch(() => {});
      }
    }
  }

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
  listRule: '', viewRule: '',
  createRule: null, updateRule: null, deleteRule: null,
  fields: [
    { name: 'postcode', type: 'text', required: true, max: 10 },
    { name: 'lat', type: 'number', required: true },
    { name: 'lng', type: 'number', required: true }
  ],
  indexes: ['CREATE INDEX idx_postcodes_postcode ON postcodes (postcode)']
};

const PLACES_SCHEMA = {
  name: 'places',
  type: 'base',
  listRule: '', viewRule: '',
  createRule: null, updateRule: null, deleteRule: null,
  fields: [
    { name: 'name', type: 'text', required: true, max: 200 },
    { name: 'source', type: 'text', required: false, max: 50 },
    { name: 'lat', type: 'number', required: true },
    { name: 'lng', type: 'number', required: true },
    { name: 'count', type: 'number', required: false }
  ],
  indexes: ['CREATE INDEX idx_places_name ON places (name)']
};

const USERS_SCHEMA = {
  name: 'users',
  type: 'auth',
  fields: [
    { name: 'role', type: 'select', required: true, maxSelect: 1, values: ['musician', 'organisation'] },
    { name: 'display_name', type: 'text', required: true, max: 100 }
  ]
};

const ORGANISATIONS_SCHEMA = {
  name: 'organisations',
  type: 'base',
  listRule: '', viewRule: '',
  createRule: "@request.auth.id != '' && @request.auth.role = 'organisation'",
  updateRule: "@request.auth.id = user.id",
  deleteRule: null,
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
  listRule: '', viewRule: '',
  createRule: "@request.auth.id != '' && organisation.verified = true && organisation.user.id = @request.auth.id",
  updateRule: "organisation.user.id = @request.auth.id",
  deleteRule: "organisation.user.id = @request.auth.id",
  fields: [
    { name: 'organisation', type: 'relation', required: true, maxSelect: 1, _relatesTo: 'organisations' },
    { name: 'title', type: 'text', required: true, max: 200 },
    { name: 'description', type: 'editor', required: true },
    { name: 'type', type: 'select', required: true, maxSelect: 1,
      values: ['Classes', 'Ensemble', 'Workshop', 'Performance', 'Lessons', 'Project'] },
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
runMain(async () => {
  const pb = await connect();

  console.log('\n→ Ensuring collections exist...');
  // Order matters: relations must point to existing collections.
  await ensureCollection(pb, USERS_SCHEMA);
  await ensureCollection(pb, POSTCODES_SCHEMA);
  await ensureCollection(pb, PLACES_SCHEMA);
  await ensureCollection(pb, ORGANISATIONS_SCHEMA);
  await ensureCollection(pb, OPPORTUNITIES_SCHEMA);

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

  console.log('\n✓ Setup complete.');
});
