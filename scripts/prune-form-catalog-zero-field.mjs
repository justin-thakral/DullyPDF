#!/usr/bin/env node
/**
 * Audit the form catalog with the same PDF.js field-extraction rules used by
 * the frontend fillable-upload flow, then optionally prune zero-field entries.
 *
 * Default mode is dry-run:
 *   node scripts/prune-form-catalog-zero-field.mjs
 *
 * Scope to one or more sections:
 *   node scripts/prune-form-catalog-zero-field.mjs --section customs_logistics
 *
 * Write mode rewrites catalog metadata and deletes matching assets:
 *   node scripts/prune-form-catalog-zero-field.mjs --write
 *   node scripts/prune-form-catalog-zero-field.mjs --write --section customs_logistics
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const MANIFEST_PATH = resolve(ROOT, 'form_catalog/manifest.json');
const PAGE_COUNTS_PATH = resolve(ROOT, 'form_catalog/page_counts.json');
const DESCRIPTIONS_PATH = resolve(ROOT, 'form_catalog/descriptions.json');
const CATALOG_ROOT = resolve(ROOT, 'form_catalog');
const PDFJS_MODULE_PATH = resolve(ROOT, 'frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
const STANDARD_FONT_DATA_PATH = resolve(ROOT, 'frontend/node_modules/pdfjs-dist/standard_fonts');

const PROGRESS_INTERVAL = 25;

function parseArgs(argv) {
  const args = argv.slice(2);
  const argSet = new Set(args);
  const sections = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--section' && args[index + 1]) {
      sections.add(args[index + 1]);
      index += 1;
      continue;
    }
    if (value.startsWith('--section=')) {
      const section = value.slice('--section='.length).trim();
      if (section) {
        sections.add(section);
      }
    }
  }
  return {
    write: argSet.has('--write'),
    sections,
  };
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function isWidgetAnnotation(annotation) {
  return (
    annotation?.subtype === 'Widget'
    || annotation?.annotationType === 20
    || Boolean(annotation?.fieldType)
  );
}

function buildRectFromAnnotation(annotationRect, viewport) {
  if (!Array.isArray(annotationRect) || annotationRect.length < 4) return null;
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotationRect);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  if (width < 1 || height < 1) return null;
  return { width, height };
}

let pdfjsModulePromise = null;
function loadPdfjs() {
  if (!pdfjsModulePromise) {
    if (!existsSync(PDFJS_MODULE_PATH)) {
      throw new Error(
        `pdfjs-dist not found at ${PDFJS_MODULE_PATH}. Run \`npm install\` in frontend/ first.`,
      );
    }
    pdfjsModulePromise = import(`file://${PDFJS_MODULE_PATH}`);
  }
  return pdfjsModulePromise;
}

async function countFieldsInDocument(doc) {
  let fieldCount = 0;

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const annotations = await page.getAnnotations({ intent: 'display' });
    for (const annotation of annotations) {
      if (!isWidgetAnnotation(annotation)) continue;
      if (!buildRectFromAnnotation(annotation.rect || [], viewport)) continue;
      fieldCount += 1;
    }
  }

  if (fieldCount > 0) {
    return fieldCount;
  }

  const fieldObjects = await doc.getFieldObjects();
  if (!fieldObjects) {
    return 0;
  }

  const pageViewportCache = new Map();
  const getViewportForPage = async (pageNum) => {
    if (pageViewportCache.has(pageNum)) {
      return pageViewportCache.get(pageNum);
    }
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    pageViewportCache.set(pageNum, viewport);
    return viewport;
  };

  for (const fieldObject of Object.values(fieldObjects).flat()) {
    const pageIndex = typeof fieldObject?.page === 'number' ? fieldObject.page : 0;
    const pageNum = Math.min(Math.max(pageIndex + 1, 1), doc.numPages);
    const viewport = await getViewportForPage(pageNum);
    if (!buildRectFromAnnotation(fieldObject?.rect || [], viewport)) continue;
    fieldCount += 1;
  }

  return fieldCount;
}

async function inspectEntry(entry) {
  const filePath = resolve(CATALOG_ROOT, entry.section, entry.filename);
  if (!existsSync(filePath)) {
    return {
      ...entry,
      filePath,
      fieldCount: null,
      error: 'missing file',
    };
  }

  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(readFileSync(filePath));
  const task = pdfjs.getDocument({
    data,
    enableXfa: true,
    disableWorker: true,
    disableFontFace: true,
    stopAtErrors: false,
    useSystemFonts: false,
    standardFontDataUrl: `file://${STANDARD_FONT_DATA_PATH}/`,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });

  try {
    const doc = await task.promise;
    try {
      const fieldCount = await countFieldsInDocument(doc);
      return {
        ...entry,
        filePath,
        fieldCount,
        error: null,
      };
    } finally {
      try {
        await doc.destroy();
      } catch {
        // Best-effort cleanup.
      }
    }
  } catch (error) {
    return {
      ...entry,
      filePath,
      fieldCount: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function savePageCountCache(cache) {
  saveJson(PAGE_COUNTS_PATH, {
    _note: 'Keyed by sha256 of each downloaded PDF. Regenerated automatically when a new PDF is scraped.',
    _entries: Object.fromEntries(
      Object.entries(cache).sort(([left], [right]) => left.localeCompare(right)),
    ),
  });
}

function pruneDescriptions(zeroFieldEntries) {
  if (!existsSync(DESCRIPTIONS_PATH)) {
    return;
  }
  const descriptions = loadJson(DESCRIPTIONS_PATH);
  const currentEntries = descriptions?._entries && typeof descriptions._entries === 'object'
    ? descriptions._entries
    : {};
  const removeKeys = new Set(
    zeroFieldEntries.map((entry) => `${entry.section}/${entry.filename}`),
  );
  const nextEntries = Object.fromEntries(
    Object.entries(currentEntries).filter(([key]) => !removeKeys.has(key)),
  );
  if (Object.keys(nextEntries).length === Object.keys(currentEntries).length) {
    return;
  }
  descriptions._entries = nextEntries;
  saveJson(DESCRIPTIONS_PATH, descriptions);
}

function prunePageCounts(zeroFieldEntries) {
  if (!existsSync(PAGE_COUNTS_PATH)) {
    return;
  }
  const pageCounts = loadJson(PAGE_COUNTS_PATH);
  const entries = pageCounts?._entries && typeof pageCounts._entries === 'object'
    ? pageCounts._entries
    : {};
  for (const entry of zeroFieldEntries) {
    if (entry.sha256) {
      delete entries[entry.sha256];
    }
  }
  savePageCountCache(entries);
}

function pruneManifest(manifest, zeroFieldEntries) {
  const removeKeys = new Set(
    zeroFieldEntries.map((entry) => `${entry.section}/${entry.filename}`),
  );
  const nextForms = (manifest.forms || []).filter((entry) => (
    !removeKeys.has(`${entry.section}/${entry.filename}`)
  ));
  return {
    ...manifest,
    total: nextForms.length,
    ok: nextForms.filter((entry) => entry?.ok === true).length,
    failed: nextForms.filter((entry) => entry?.ok !== true).length,
    forms: nextForms,
  };
}

function removeCatalogFiles(zeroFieldEntries) {
  for (const entry of zeroFieldEntries) {
    const filePath = resolve(CATALOG_ROOT, entry.section, entry.filename);
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
    const thumbnailPath = filePath.replace(/\.pdf$/i, '.webp');
    if (existsSync(thumbnailPath)) {
      rmSync(thumbnailPath, { force: true });
    }
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing manifest at ${MANIFEST_PATH}`);
  }

  const manifest = loadJson(MANIFEST_PATH);
  const okForms = Array.isArray(manifest?.forms)
    ? manifest.forms.filter((entry) => entry?.ok === true && entry.section && entry.filename)
    : [];
  const scopedForms = options.sections.size > 0
    ? okForms.filter((entry) => options.sections.has(entry.section))
    : okForms;

  console.log(`[prune-form-catalog-zero-field] auditing ${scopedForms.length} hosted forms`);
  const inspected = [];
  for (let index = 0; index < scopedForms.length; index += 1) {
    const result = await inspectEntry(scopedForms[index]);
    inspected.push(result);
    const completed = index + 1;
    if (completed % PROGRESS_INTERVAL === 0 || completed === scopedForms.length) {
      console.log(
        `[prune-form-catalog-zero-field] ${completed}/${scopedForms.length} checked`,
      );
    }
  }

  const zeroFieldEntries = inspected.filter((entry) => entry.fieldCount === 0);
  const erroredEntries = inspected.filter((entry) => entry.error);
  const remainingForms = scopedForms.length - zeroFieldEntries.length;

  console.log(
    `[prune-form-catalog-zero-field] ${zeroFieldEntries.length} zero-field forms, ${erroredEntries.length} errors, ${remainingForms} kept`,
  );
  if (zeroFieldEntries.length) {
    for (const entry of zeroFieldEntries) {
      console.log(`ZERO ${entry.section}/${entry.filename} :: ${entry.form_number || entry.title}`);
    }
  }
  if (erroredEntries.length) {
    for (const entry of erroredEntries.slice(0, 20)) {
      console.warn(`ERROR ${entry.section}/${entry.filename} :: ${entry.error}`);
    }
    if (erroredEntries.length > 20) {
      console.warn(`[prune-form-catalog-zero-field] ... ${erroredEntries.length - 20} more errors`);
    }
  }

  if (!options.write) {
    return;
  }

  pruneDescriptions(zeroFieldEntries);
  prunePageCounts(zeroFieldEntries);
  const nextManifest = pruneManifest(manifest, zeroFieldEntries);
  saveJson(MANIFEST_PATH, nextManifest);
  removeCatalogFiles(zeroFieldEntries);

  console.log(
    `[prune-form-catalog-zero-field] wrote manifest and removed ${zeroFieldEntries.length} catalog files`,
  );
}

main().catch((error) => {
  console.error('[prune-form-catalog-zero-field] failed:', error);
  process.exit(1);
});
