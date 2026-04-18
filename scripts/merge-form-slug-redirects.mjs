#!/usr/bin/env node
/**
 * Merge form_catalog/slug_redirects.json into firebase.json hosting.redirects.
 *
 * Manual redirects kept by humans are preserved. Auto-generated entries
 * (source path matches /forms/*) are replaced with a fresh set from
 * slug_redirects.json. Run after build-form-catalog-index.mjs regenerates slugs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const FIREBASE_JSON = resolve(ROOT, 'firebase.json');
const SLUG_REDIRECTS = resolve(ROOT, 'form_catalog/slug_redirects.json');

const firebase = JSON.parse(readFileSync(FIREBASE_JSON, 'utf8'));
const slugRedirects = JSON.parse(readFileSync(SLUG_REDIRECTS, 'utf8'));

const hosting = firebase.hosting;
if (!hosting) throw new Error('firebase.json has no "hosting" block');

const existing = Array.isArray(hosting.redirects) ? hosting.redirects : [];
const manual = existing.filter((r) => !String(r.source || '').startsWith('/forms/'));
const merged = [...manual, ...slugRedirects];

hosting.redirects = merged;

writeFileSync(FIREBASE_JSON, `${JSON.stringify(firebase, null, 2)}\n`);

console.log(
  `[merge-form-slug-redirects] ${manual.length} manual + ${slugRedirects.length} form-slug = ${merged.length} total redirects → firebase.json`,
);
