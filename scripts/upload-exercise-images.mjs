// One-off (manual step): copy the free-exercise-db images into a public Supabase Storage bucket so the app
// doesn't depend on GitHub. Then set EXPO_PUBLIC_EXERCISE_IMAGE_BASE=https://<ref>.supabase.co/storage/v1/object/public/exercise-images/
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-exercise-images.mjs
import { readFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const SRC = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const headers = { Authorization: `Bearer ${key}`, apikey: key };

await fetch(`${url}/storage/v1/bucket`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'exercise-images', name: 'exercise-images', public: true }),
}); // ignore "already exists"

const paths = JSON.parse(readFileSync('supabase/seed/exercises.json', 'utf8')).flatMap((e) => e.images ?? []);
let done = 0;
for (const path of paths) {
  const img = await fetch(SRC + path);
  if (!img.ok) {
    console.warn('missing', path);
    continue;
  }
  const res = await fetch(`${url}/storage/v1/object/exercise-images/${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
    body: Buffer.from(await img.arrayBuffer()),
  });
  if (!res.ok) console.warn('upload failed', path, res.status);
  if (++done % 100 === 0) console.log(`${done}/${paths.length}`);
}
console.log(`uploaded ${done} images`);
