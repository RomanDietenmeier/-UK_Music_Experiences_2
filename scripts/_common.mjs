// scripts/_common.mjs
// Shared helpers for setup.mjs, verify.mjs, faker.mjs.

import PocketBase from 'pocketbase';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- .env loader ----------------------------------------------------------
export function loadEnv() {
  const envPath = resolve(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, k, v] = m;
    if (!(k in process.env)) process.env[k] = v.replace(/^["']|["']$/g, '');
  }
}

// --- PocketBase client + auth --------------------------------------------
export async function connect() {
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
      console.error(`    Check PB_EMAIL / PB_PASSWORD. Script needs a superuser/admin.`);
      process.exit(1);
    }
  }
  console.log('  ✓ authenticated');

  return pb;
}

// --- Standard top-level error handler ------------------------------------
export function runMain(fn) {
  fn().catch((err) => {
    console.error('\n❌  Error:', err.message);
    if (err.response) console.error('    Response:', JSON.stringify(err.response, null, 2));
    process.exit(1);
  });
}
