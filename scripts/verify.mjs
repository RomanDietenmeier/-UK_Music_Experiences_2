// scripts/verify.mjs
//
// Read-only integrity check. Verifies that the PocketBase collections match
// what CLAUDE.md expects (missing collections, missing fields, type mismatches).
// Does not modify anything. Safe to run any time.
//
// Usage: npm run verify

import { connect, runMain } from './_common.mjs';

// --- Expected schema ------------------------------------------------------
// Loose type check: field exists + type family matches + required flag matches.

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
  const actualRequired = actualField.required === true;
  if (expected.required !== undefined && actualRequired !== expected.required) {
    issues.push(`required=${actualRequired}, expected ${expected.required}`);
  }
  if (expected.values && actualField.values) {
    const missing = expected.values.filter((v) => !actualField.values.includes(v));
    if (missing.length) issues.push(`missing select values: ${missing.join(', ')}`);
  }
  return issues;
}

runMain(async () => {
  const pb = await connect();
  console.log('');

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

    if (spec.type && collection.type !== spec.type) {
      console.log(COLORS.yellow(`  ⚠ collection type is "${collection.type}", expected "${spec.type}"`));
      totalIssues++;
    }

    const actualFields = {};
    for (const f of collection.fields || collection.schema || []) actualFields[f.name] = f;

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

    const expectedNames = new Set(spec.fields.map((f) => f.name));
    const systemFields = new Set([
      'id', 'created', 'updated',
      'email', 'emailVisibility', 'verified', 'tokenKey', 'password'
    ]);
    if (name === 'organisations') systemFields.delete('verified');

    const extras = Object.keys(actualFields).filter(
      (n) => !expectedNames.has(n) && !systemFields.has(n)
    );
    if (extras.length) console.log(COLORS.dim(`  · extra fields present (ok): ${extras.join(', ')}`));
    console.log();
  }

  console.log(COLORS.bold('─'.repeat(50)));
  if (totalIssues === 0) {
    console.log(COLORS.green(`✓ All ${totalChecked} field checks passed.`));
  } else {
    console.log(COLORS.red(`✗ ${totalIssues} issue(s) found across ${totalChecked} checks.`));
    process.exit(1);
  }
});
