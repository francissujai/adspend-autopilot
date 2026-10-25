// Text features for H-MEM retrieval: tokens, a deterministic hashed embedding,
// cosine, Jaccard, entity extraction and domain classification. The embedding
// is a pure function of the text (FNV-1a token hashing into 64 dims), so
// scores reproduce exactly across runs; swap embed() for a model embedder later.

const DIM = 64;
const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "was", "were", "be", "by", "with", "at", "it", "this", "that", "did", "do", "why", "what", "how", "last", "week"]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_.\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function embed(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  for (const t of tokenize(text)) {
    const h = fnv1a(t);
    v[h % DIM] += ((h >>> 8) % 2 === 0 ? 1 : -1) * (1 + ((h >>> 16) % 8) / 8);
  }
  const n = Math.hypot(...v);
  return n === 0 ? v : v.map((x) => x / n);
}

export const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Things autopilot memories are about: ad lines, platforms, Zetaris tables, money moves, dates. */
export function extractEntities(text: string, cap = 10): string[] {
  const found = new Set<string>();
  const add = (s: string) => found.size < cap && found.add(s.toLowerCase());
  for (const m of text.matchAll(/\b(2385\d{7}|g-\d{4})\b/g)) add(m[0]);
  for (const m of text.matchAll(/\b[a-z]+_pg\.[a-z_]+\b|\bautopilot\.[a-z_]+\b/gi)) add(m[0]);
  for (const m of text.matchAll(/\b(meta|google|lookalike|retargeting|prospecting|display|search|pmax|attribution|view-through|budget)\b/gi)) add(m[0]);
  for (const m of text.matchAll(/\$\s?[\d,]+(?:k)?\b/gi)) add(m[0].replace(/\s/g, ""));
  for (const m of text.matchAll(/\b20\d\d-\d\d-\d\d\b/g)) add(m[0]);
  for (const m of text.matchAll(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b/g)) add(m[0]);
  return [...found];
}

const DOMAINS: [string, RegExp][] = [
  ["attribution", /\b(attribution|view-through|platform-reported|reported revenue|roas spike|mismatch)\b/i],
  ["budget", /\b(budget|shift|reallocat\w*|spend|bid|cap)\b/i],
  ["safety", /\b(injection|blocked|approval|rejected|override|policy)\b/i],
  ["creative", /\b(creative|video|ugc|carousel)\b/i],
  ["data", /\b(sql|table|column|zetaris|query|schema|join)\b/i],
];

export function classifyDomain(text: string, tags: string[] = []): string {
  const hay = `${text} ${tags.join(" ")}`;
  for (const [domain, re] of DOMAINS) if (re.test(hay)) return domain;
  return "general";
}
