// SEO pages (docs/ARCHITECTURE.md "Phase 3 — Reach"): static /calories/[dish] pages generated from
// food_items after `expo export`, plus /calories/ (index), sitemap.xml and robots.txt. Plain HTML + CSS, no
// JavaScript, so they load instantly and index well. Numbers come from the same portion engine the app uses.
//   node scripts/build-seo.mjs [outDir]       (default: dist; SITE_URL overrides the canonical origin)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeItem, gramsPerUnit } from '../src/features/portions/engine.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CTX = { katori_ml: 150, plate_size: 'medium' };
const UNIT_LABEL = {
  katori: 'katori (150 ml)',
  roti: 'piece',
  piece: 'piece',
  plate: 'plate',
  glass: 'glass (250 ml)',
  tbsp: 'tablespoon',
  scoop: 'scoop',
  g: '100 g',
};

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;

/** Servings shown on a dish page: its default unit, a katori when it has a density, and 100 g. */
export function servings(food) {
  const units = [food.units.default, 'katori', 'g'].filter(
    (u, i, a) => a.indexOf(u) === i && (u === 'g' || gramsPerUnit(food, u, CTX) !== null),
  );
  return units.map((unit) => {
    const c = computeItem(
      food,
      { key: unit, dish: food.name, unit, qty: unit === 'g' ? 100 : 1, oil_level: null, confidence: 1, certainty: 'asked' },
      CTX,
      'home',
    );
    return {
      unit,
      label: unit === 'g' ? '100 g' : `1 ${UNIT_LABEL[unit] ?? unit}`,
      grams: r0(c.grams),
      kcal: r0(c.kcal),
      kcal_low: r0(c.kcal_low),
      kcal_high: r0(c.kcal_high),
      protein: r1(c.protein_g),
      carbs: r1(c.carbs_g),
      fat: r1(c.fat_g),
    };
  });
}

const STYLE = `
:root{--bg:#FBF7F1;--surface:#fff;--ink:#1A1714;--muted:#6B645C;--line:#E8DFD3;--accent:#F26B1D;--soft:#FDE6D6}
@media (prefers-color-scheme:dark){:root{--bg:#14110F;--surface:#1C1916;--ink:#F5EFE7;--muted:#A39A90;--line:#2E2924;--soft:#3A2416}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 Manrope,system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:24px 16px 64px}a{color:inherit}
h1,h2{font-family:Fraunces,Georgia,serif;font-weight:700;line-height:1.15}h1{font-size:2.1rem;margin:.2em 0}
.big{font-family:Fraunces,Georgia,serif;font-size:3.2rem;font-weight:700}.muted{color:var(--muted)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:16px;margin:16px 0}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:right;padding:8px 4px;border-bottom:1px solid var(--line);white-space:nowrap}td:first-child{white-space:normal}
th:first-child,td:first-child{text-align:left}.cta{display:block;text-align:center;background:var(--accent);color:#1A1714;
font-weight:700;text-decoration:none;border-radius:999px;padding:16px;min-height:52px;margin:24px 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}.chips a{display:inline-block;padding:10px 14px;border-radius:999px;
background:var(--soft);text-decoration:none;min-height:44px}.brand{font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:.8rem;text-decoration:none}
@media (max-width:420px){h1{font-size:1.7rem}.big{font-size:2.6rem}}`;

function shell({ title, description, canonical, body }) {
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(new URL('/icons/icon-512.png', canonical).href)}">
<meta name="theme-color" content="#F26B1D">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Manrope:wght@400;600;800&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body><main>
<a class="brand" href="/">Katori</a>
${body}
</main></body>
</html>
`;
}

export function dishPage(food, related, site) {
  const s = servings(food);
  const main = s[0];
  const canonical = `${site}/calories/${food.slug}`;
  const aka = food.aliases?.length ? `Also called ${food.aliases.slice(0, 4).map(esc).join(', ')}.` : '';
  const rows = s
    .map((x) => `<tr><td>${esc(x.label)}${x.unit === 'g' ? '' : ` <span class="muted">(${x.grams} g)</span>`}</td><td>${x.kcal}</td><td>${x.protein} g</td><td>${x.carbs} g</td><td>${x.fat} g</td></tr>`)
    .join('');
  const oil = food.default_oil_g > 0 ? `<p class="muted">Includes about ${r0((food.default_oil_g * main.grams) / 100)} g of oil per ${esc(main.label.replace(/^1 /, ''))}. Restaurant versions usually use more; Katori asks “ghar ka ya bahar ka?” and adjusts.</p>` : '';
  return shell({
    title: `${food.name} calories: ${main.kcal} kcal in ${main.label} | Katori`,
    description: `${main.label} of ${food.name} has about ${main.kcal} kcal (${main.kcal_low}–${main.kcal_high}) and ${main.protein} g protein. Full nutrition per katori, piece and 100 g.`,
    canonical,
    body: `
<h1>Calories in ${esc(food.name)}</h1>
<p class="muted">${aka}</p>
<div class="card">
  <div class="big">${main.kcal} kcal</div>
  <div>in ${esc(main.label)} · ${main.protein} g protein</div>
  <div class="muted">Typical range ${main.kcal_low}–${main.kcal_high} kcal, depending on portion and oil.</div>
</div>
<div class="card">
<table><thead><tr><th>Serving</th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>${rows}</tbody></table>
</div>
${oil}
<p class="muted">Estimates from standard home recipes, not yet reviewed by a nutritionist. A katori here is 150 ml; in the app you set your own katori size.</p>
<a class="cta" href="/">Snap your plate. Katori counts it for you.</a>
${related.length ? `<h2>More ${esc(cuisineName(food.cuisine))} dishes</h2><ul class="chips">${related.map((r) => `<li><a href="/calories/${esc(r.slug)}">${esc(r.name)}</a></li>`).join('')}</ul>` : ''}
<p><a href="/calories/">All dishes</a></p>`,
  });
}

const cuisineName = (c) => (c ? c.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()) : 'Indian');

export function indexPage(foods, site) {
  const items = foods
    .map((f) => `<li><a href="/calories/${esc(f.slug)}">${esc(f.name)}</a> <span class="muted">${servings(f)[0].kcal} kcal</span></li>`)
    .join('');
  return shell({
    title: 'Calories in Indian food: dal, roti, sabzi, thali and more | Katori',
    description: `Calories and protein for ${foods.length} Indian dishes per katori, piece and plate, from home recipes.`,
    canonical: `${site}/calories/`,
    body: `<h1>Calories in Indian food</h1><p class="muted">Per katori, piece or plate, the way you actually eat.</p>
<a class="cta" href="/">Track your meals with a photo</a><ul style="list-style:none;padding:0;columns:2;gap:16px">${items}</ul>`,
  });
}

export function sitemap(foods, site, today) {
  const urls = ['/', '/calories/', '/coach', ...foods.map((f) => `/calories/${f.slug}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(site + u)}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
}

/** Dishes only (ingredients and packaged items don't get pages), alphabetical. */
export function loadDishes() {
  const all = JSON.parse(readFileSync(join(root, 'src/features/demo/food_items.json'), 'utf8'));
  return all.filter((f) => f.kind === 'dish' && f.slug).sort((a, b) => a.name.localeCompare(b.name));
}

export function build(outDir, site = 'https://katori.unmatrix.in', today = new Date().toISOString().slice(0, 10)) {
  const foods = loadDishes();
  const write = (rel, content) => {
    const p = join(outDir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  };
  for (const f of foods) {
    const related = foods.filter((x) => x.cuisine === f.cuisine && x.slug !== f.slug).slice(0, 8);
    write(`calories/${f.slug}/index.html`, dishPage(f, related, site));
  }
  write('calories/index.html', indexPage(foods, site));
  write('sitemap.xml', sitemap(foods, site, today));
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /coach/client/\nSitemap: ${site}/sitemap.xml\n`);
  return foods.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = resolve(root, process.argv[2] ?? 'dist');
  const n = build(out, (process.env.SITE_URL ?? 'https://katori.unmatrix.in').replace(/\/$/, ''));
  console.log(`seo: ${n} dish pages + index, sitemap.xml, robots.txt → ${out}`);
}
