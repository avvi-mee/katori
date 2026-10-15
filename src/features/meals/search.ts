// Client-side dish search over the cached food_items table (works offline).
export type Searchable = { id: string; name: string; aliases: string[]; kind: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Name/alias matches, prefix matches first; cooked dishes outrank raw ingredients ("rice" → Steamed Rice). */
export function searchFoods<T extends Searchable>(foods: T[], query: string, limit = 25): T[] {
  const q = norm(query);
  if (!q) return [];
  const scored: { f: T; score: number }[] = [];
  for (const f of foods) {
    const names = [f.name, ...f.aliases].map(norm);
    let score = 0;
    for (const n of names) {
      if (n === q) score = Math.max(score, 4);
      else if (n.startsWith(q)) score = Math.max(score, 3);
      else if (n.split(' ').some((w) => w.startsWith(q))) score = Math.max(score, 2);
      else if (n.includes(q)) score = Math.max(score, 1);
    }
    if (score) scored.push({ f, score: score + (f.kind === 'dish' ? 1.5 : 0) });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name))
    .slice(0, limit)
    .map((s) => s.f);
}
