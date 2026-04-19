#!/usr/bin/env node
// Warn about public routes whose <meta name="description"> exceeds the
// Google-recommended 110–160 character range. Prints a summary plus a
// per-offender table; exits 0 regardless (this is advisory, not a gate).

import { ALL_ROUTES } from '../frontend/src/config/publicRouteSeoData.mjs';

const MAX_RECOMMENDED = 160;

const offenders = [];
const buckets = { '≤120': 0, '121-160': 0, '161-180': 0, '181-200': 0, '>200': 0 };
const byKind = new Map();

for (const route of ALL_ROUTES) {
  const desc = route.seo?.description || '';
  const len = desc.length;
  const kind = route.kind || 'unknown';
  if (!byKind.has(kind)) byKind.set(kind, { count: 0, over: 0, max: 0 });
  const k = byKind.get(kind);
  k.count += 1;
  if (len > MAX_RECOMMENDED) k.over += 1;
  if (len > k.max) k.max = len;
  if (len <= 120) buckets['≤120'] += 1;
  else if (len <= 160) buckets['121-160'] += 1;
  else if (len <= 180) buckets['161-180'] += 1;
  else if (len <= 200) buckets['181-200'] += 1;
  else buckets['>200'] += 1;
  if (len > MAX_RECOMMENDED) offenders.push({ path: route.path, kind, len, desc });
}

console.log(`Meta description audit — ${ALL_ROUTES.length} public routes\n`);
console.log('Length distribution:');
for (const [label, count] of Object.entries(buckets)) {
  console.log(`  ${label.padEnd(8)} ${count}`);
}
console.log(`\nBy kind (count / over-${MAX_RECOMMENDED} / max):`);
for (const [kind, stats] of byKind) {
  const flag = stats.over > 0 ? ' ⚠' : '';
  console.log(`  ${kind.padEnd(22)} ${stats.count.toString().padStart(5)} / ${stats.over.toString().padStart(4)} / ${stats.max.toString().padStart(3)}${flag}`);
}

if (offenders.length === 0) {
  console.log(`\nAll descriptions ≤ ${MAX_RECOMMENDED} chars.`);
  process.exit(0);
}

offenders.sort((a, b) => b.len - a.len);
console.log(`\n${offenders.length} route(s) exceed ${MAX_RECOMMENDED} chars:`);
for (const o of offenders) {
  console.log(`  ${o.len.toString().padStart(3)}  ${o.kind.padEnd(22)} ${o.path}`);
}
