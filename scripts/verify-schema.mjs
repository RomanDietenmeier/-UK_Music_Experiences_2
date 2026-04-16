// scripts/verify-schema.mjs
//
// Verifies that the PocketBase collections match what CLAUDE.md expects.
// Reports missing collections, missing fields, and type mismatches.
// Does NOT modify anything — read-only.
//
// Usage: npm run verify

import PocketBase from 'pocketbase';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// --- .env loader ----------------------------------------------------------
(() => {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, k, v] = m;
    if (!(k in process.env)) process.env[k] = v.replace(/^["']|["']$/g, '');
  }
})();

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const PB_EMAIL = process.env.PB_EMAIL;
const PB_PASSWORD = process.env.PB_PASSWORD;

if (!PB_EMAIL || !PB_PASSWORD) {
  console.error('❌  Missing PB_EMAIL or PB_PASSWORD — set them in .env or as env vars.');
  process.exit(1);
}

// --- Expected schema ------------------------------------------------------
// For each collection: which fields must exist, and what type family we expect.
// Type families are loose (PocketBase uses internal names like "text", "number",
// "bool", "date", "select", "relation", "editor", "file", "url", "autodate").
// We only check: field exists + type family matches + required flag matches.

const EXPECTED = {
  users: {
    type: 'auth',
    fields: [
      { name: 'role', type: 'select', required: true, values: ['musician', 'organisation'] },
      { name: 'display_name', type: 'text', required: true }
    ]
  },
  organisations: {
    type: 'base',
    fields: [
      { name: 'user', type: 'relation', required: true, relatesTo: 'users' },
      { name: 'name', type: 'text', required: true },
      { name: 'description', type: ['text', 'editor'], required: false },
      { name: 'verified', type: 'bool', required: false }
    ]
  },
  opportunities: {
    type: 'base',
    fields: [
      { name: 'organisation', type: 'relation', required: true, relatesTo: 'organisations' },
      { name: 'title', type: 'text', required: true },
      { name: 'description', type: ['text', 'editor'], required: true },
      { name: 'type', type: 'select', required: true,
        values: ['Classes', 'Ensemble', 'Workshop', 'Performance', 'Lessons', 'Project'] },
      { name: 'instruments', type: 'text', required: false },
      { name: 'age_group', type: 'text', required: false },
      { name: 'website', type: ['url', 'text'], required: false },
      { name: 'location_name', type: 'text', required: true },
      { name: 'location_lat', type: 'number', required: true },
      { name: 'location_lng', type: 'number', required: true },
      { name: 'postcode', type: 'text', required: true },
      { name: 'expires_at', type: 'date', required: false }
    ]
  },
  postcodes: {
    type: 'base',
    fields: [
      { name: 'postcode', type: 'text', required: true },
      { name: 'lat', type: 'number', required: true },
      { name: 'lng', type: 'number', required: true }
    ]
  },
  places: {
    type: 'base',
    fields: [
      { name: 'name', type: 'text', required: true },
      { name: 'source', type: 'text', required: false },
      { name: 'lat', type: 'number', required: true },
      { name: 'lng', type: 'number', required: true },
      { name: 'count', type: 'number', required: false }
    ]
  }
};

// --- Helpers --------------------------------------------------------------
const COLORS = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};

function matchType(actual, expected) {
  const expectedList = Array.isArray(expected) ? expected : [expected];
  return expectedList.includes(actual);
}

function checkField(actualField, expected) {
  const issues = [];
  if (!matchType(actualField.type, expected.type)) {
    const want = Array.isArray(expected.type) ? expected.type.join('|') : expected.type;
    issues.push(`type is "${actualField.type}", expected "${want}"`);
  }
  // Required check — PocketBase stores this as `required` bool on the field
  const actualRequired = actualField.required === true;
  if (expected.required !== undefined && actualRequired !== expected.required) {
    issues.push(`required=${actualRequired}, expected ${expected.required}`);
  }
  // Select values check (loose: expected values must be a subset of actual)
  if (expected.values && actualField.values) {
    const missing = expected.values.filter((v) => !actualField.values.includes(v));
    if (missing.length) {
      issues.push(`missing select values: ${missing.join(', ')}`);
    }
  }
  // Relation target check
  if (expected.relatesTo && actualField.collectionId) {
    // We can't verify the target collection name directly from the field metadata
    // without another lookup; leave as informational.
  }
  return issues;
}

// --- Main -----------------------------------------------------------------
async function main() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);

  console.log(`Connecting to PocketBase at ${PB_URL} as ${PB_EMAIL}...`);
  try {
    await pb.collection('_superusers').authWithPassword(PB_EMAIL, PB_PASSWORD);
  } catch {
    try {
      await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
    } catch (err) {
      console.error(`❌  Auth failed: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(COLORS.green('  ✓ authenticated\n'));

  let totalIssues = 0;
  let totalChecked = 0;

  for (const [name, spec] of Object.entries(EXPECTED)) {
    console.log(COLORS.bold(`${name}`));
    let collection;
    try {
      collection = await pb.collections.getOne(name);
    } catch (err) {
      if (err.status === 404) {
        console.log(COLORS.red(`  ✗ collection does not exist`));
        totalIssues++;
        continue;
      }
      throw err;
    }

    // Check collection type
    if (spec.type && collection.type !== spec.type) {
      console.log(COLORS.yellow(`  ⚠ collection type is "${collection.type}", expected "${spec.type}"`));
      totalIssues++;
    }

    // Index actual fields by name (exclude system fields like id/created/updated)
    const actualFields = {};
    for (const f of collection.fields || collection.schema || []) {
      actualFields[f.name] = f;
    }

    for (const expected of spec.fields) {
      totalChecked++;
      const actual = actualFields[expected.name];
      if (!actual) {
        console.log(COLORS.red(`  ✗ ${expected.name}: missing`));
        totalIssues++;
        continue;
      }
      const issues = checkField(actual, expected);
      if (issues.length === 0) {
        console.log(COLORS.green(`  ✓ ${expected.name}`) + COLORS.dim(` (${actual.type})`));
      } else {
        console.log(COLORS.red(`  ✗ ${expected.name}: ${issues.join('; ')}`));
        totalIssues += issues.length;
      }
    }

    // Warn about extra unexpected fields (informational only)
    const expectedNames = new Set(spec.fields.map((f) => f.name));
    const systemFields = new Set([
      'id', 'created', 'updated',
      'email', 'emailVisibility', 'verified', 'tokenKey', 'password' // auth built-ins
    ]);
    // For organisations we expect a `verified` field of our own, so don't treat as system
    if (name === 'organisations') systemFields.delete('verified');

    const extras = Object.keys(actualFields).filter(
      (n) => !expectedNames.has(n) && !systemFields.has(n)
    );
    if (extras.length) {
      console.log(COLORS.dim(`  · extra fields present (ok): ${extras.join(', ')}`));
    }
    console.log();
  }

  console.log(COLORS.bold('─'.repeat(50)));
  if (totalIssues === 0) {
    console.log(COLORS.green(`✓ All ${totalChecked} field checks passed.`));
  } else {
    console.log(COLORS.red(`✗ ${totalIssues} issue(s) found across ${totalChecked} checks.`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌  Error:', err.message);
  if (err.response) console.error('    Response:', JSON.stringify(err.response, null, 2));
  process.exit(1);
});
