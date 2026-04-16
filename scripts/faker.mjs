// scripts/faker.mjs
//
// DEV ONLY — seeds synthetic demo data into PocketBase:
//   - one demo owner user (email: demo-org@example.com)
//   - one verified organisation "Demo Music Trust"
//   - six opportunities across the UK (from CLAUDE.md §Synthetic Demo Data)
//
// Idempotent: re-running skips records that already exist.
// NEVER run this in production — it creates a user with a default password.
//
// Usage: npm run faker

import { connect, runMain } from './_common.mjs';

const DEMO_OWNER = {
  email: 'demo-org@example.com',
  password: 'demo-password-change-me',
  role: 'organisation',
  display_name: 'Demo Music Trust Admin'
};

const DEMO_ORG = {
  name: 'Demo Music Trust',
  description: 'A synthetic organisation used to seed demo opportunities across the UK.',
  verified: true
};

const DEMO_OPPORTUNITIES = [
  { title: 'Farnham Youth Guitar Workshop', type: 'Workshop',
    location_name: 'Farnham Maltings, Farnham', postcode: 'GU9 7QR',
    location_lat: 51.214, location_lng: -0.799,
    age_group: '8-16', instruments: 'Guitar',
    description: 'Weekly guitar workshop for 8-16 year olds at Farnham Maltings.' },
  { title: 'Bristol Community Choir', type: 'Ensemble',
    location_name: "St George's, Bristol", postcode: 'BS1 5RR',
    location_lat: 51.454, location_lng: -2.597,
    age_group: '18+', instruments: 'Voice',
    description: 'Open-access community choir rehearsing weekly in central Bristol.' },
  { title: 'London Piano Masterclass', type: 'Classes',
    location_name: 'Royal Academy, London', postcode: 'W1B 1BS',
    location_lat: 51.518, location_lng: -0.144,
    age_group: 'All Ages', instruments: 'Piano',
    description: 'Piano masterclass sessions for intermediate to advanced pianists.' },
  { title: 'Brighton Jazz Ensemble', type: 'Ensemble',
    location_name: 'The Old Market, Brighton', postcode: 'BN1 1NF',
    location_lat: 50.829, location_lng: -0.137,
    age_group: '14+', instruments: 'Saxophone, Trumpet',
    description: 'Monthly jazz ensemble sessions open to brass and woodwind players 14+.' },
  { title: 'Manchester Drum Lessons', type: 'Lessons',
    location_name: 'Band on the Wall, Manchester', postcode: 'M4 5JZ',
    location_lat: 53.485, location_lng: -2.236,
    age_group: '5-11', instruments: 'Drums',
    description: 'Group drum lessons for children aged 5-11.' },
  { title: 'Edinburgh Youth Orchestra', type: 'Performance',
    location_name: 'Usher Hall, Edinburgh', postcode: 'EH1 2EA',
    location_lat: 55.947, location_lng: -3.207,
    age_group: '11-18', instruments: 'Any',
    description: 'Youth orchestra performance seasons — auditions held termly.' }
];

runMain(async () => {
  // Production guard — refuse to run unless explicitly targeting localhost.
  const pbUrl = process.env.PB_URL || 'http://127.0.0.1:8090';
  if (!/^(http:\/\/)?(127\.0\.0\.1|localhost)/.test(pbUrl) && !process.env.FAKER_FORCE) {
    console.error(`❌  Faker refusing to run against "${pbUrl}".`);
    console.error(`    Demo data must not be seeded in production.`);
    console.error(`    Override: set FAKER_FORCE=1 if you really mean it.`);
    process.exit(1);
  }

  const pb = await connect();

  console.log('\n→ Seeding demo data...');

  // 1. Demo owner user
  let owner;
  try {
    owner = await pb.collection('users').getFirstListItem(`email="${DEMO_OWNER.email}"`);
    console.log(`  ✓ demo owner user exists (${owner.email})`);
  } catch (err) {
    if (err.status !== 404) throw err;
    owner = await pb.collection('users').create({
      email: DEMO_OWNER.email,
      password: DEMO_OWNER.password,
      passwordConfirm: DEMO_OWNER.password,
      role: DEMO_OWNER.role,
      display_name: DEMO_OWNER.display_name,
      emailVisibility: false,
      verified: true
    });
    console.log(`  ✓ created demo owner user (${owner.email})`);
  }

  // 2. Demo organisation (linked to owner)
  let org;
  try {
    org = await pb.collection('organisations').getFirstListItem(`user="${owner.id}"`);
    console.log(`  ✓ demo organisation exists ("${org.name}")`);
  } catch (err) {
    if (err.status !== 404) throw err;
    org = await pb.collection('organisations').create({
      user: owner.id,
      name: DEMO_ORG.name,
      description: DEMO_ORG.description,
      verified: DEMO_ORG.verified
    });
    console.log(`  ✓ created demo organisation ("${org.name}")`);
  }

  // 3. Demo opportunities (idempotent by title+organisation)
  let created = 0, skipped = 0;
  for (const opp of DEMO_OPPORTUNITIES) {
    const filter = `title="${opp.title.replace(/"/g, '\\"')}" && organisation="${org.id}"`;
    try {
      await pb.collection('opportunities').getFirstListItem(filter);
      skipped++;
    } catch (err) {
      if (err.status !== 404) throw err;
      await pb.collection('opportunities').create({ ...opp, organisation: org.id });
      created++;
    }
  }
  console.log(`  ✓ opportunities: ${created} created, ${skipped} already existed`);

  console.log('\n✓ Faker complete.');
  console.log(`\n  Demo login: ${DEMO_OWNER.email} / ${DEMO_OWNER.password}`);
});
