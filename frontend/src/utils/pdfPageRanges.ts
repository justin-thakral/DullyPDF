/**
 * Shared helpers for user-entered PDF page selections.
 */

export function parsePdfPageSelection(raw: string, maxPage: number): number[] {
  if (!Number.isInteger(maxPage) || maxPage < 1) {
    throw new Error('This PDF does not have any selectable pages.');
  }

  const normalized = raw.trim().toLowerCase().replace(/\s*-\s*/g, '-');
  if (!normalized || normalized === 'all') {
    return Array.from({ length: maxPage }, (_, index) => index + 1);
  }

  const pages: number[] = [];
  const seen = new Set<number>();
  const parseOne = (value: string) => value === 'last' ? maxPage : Number(value);

  // The parser is O(token_count + selected_page_count), including expanded ranges.
  for (const token of normalized.split(/[,\s]+/).filter(Boolean)) {
    const rangeMatch = token.match(/^(last|\d+)-(last|\d+)$/);
    const singleMatch = token.match(/^(last|\d+)$/);

    if (rangeMatch) {
      const start = parseOne(rangeMatch[1]);
      const end = parseOne(rangeMatch[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || start > maxPage || end > maxPage) {
        throw new Error(`Page range "${token}" is outside this PDF.`);
      }
      const step = start <= end ? 1 : -1;
      for (let page = start; step > 0 ? page <= end : page >= end; page += step) {
        if (!seen.has(page)) {
          seen.add(page);
          pages.push(page);
        }
      }
      continue;
    }

    if (singleMatch) {
      const page = parseOne(singleMatch[1]);
      if (!Number.isInteger(page) || page < 1 || page > maxPage) {
        throw new Error(`Page "${token}" is outside this PDF.`);
      }
      if (!seen.has(page)) {
        seen.add(page);
        pages.push(page);
      }
      continue;
    }

    throw new Error(`Could not read page range "${token}".`);
  }

  if (!pages.length) {
    throw new Error('Choose at least one page.');
  }
  return pages;
}

export function summarizePdfPageSelection(pages: number[], maxPreview = 8): string {
  if (!pages.length) return 'No pages selected';
  const preview = pages.slice(0, maxPreview).join(', ');
  const remaining = pages.length - maxPreview;
  return remaining > 0 ? `${preview}, +${remaining} more` : preview;
}
