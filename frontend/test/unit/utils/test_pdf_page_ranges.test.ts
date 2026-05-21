import { describe, expect, it } from 'vitest';

import { parsePdfPageSelection, summarizePdfPageSelection } from '../../../src/utils/pdfPageRanges';

describe('pdfPageRanges', () => {
  it('parses all, individual pages, last, and forward ranges', () => {
    expect(parsePdfPageSelection('all', 4)).toEqual([1, 2, 3, 4]);
    expect(parsePdfPageSelection('', 3)).toEqual([1, 2, 3]);
    expect(parsePdfPageSelection('1, 3 last', 5)).toEqual([1, 3, 5]);
    expect(parsePdfPageSelection('2-4', 5)).toEqual([2, 3, 4]);
  });

  it('preserves reverse range order while de-duplicating selected pages', () => {
    expect(parsePdfPageSelection('4-2, 2, 1', 5)).toEqual([4, 3, 2, 1]);
  });

  it('accepts spaces around range separators', () => {
    expect(parsePdfPageSelection('1 - 3, last - 4', 5)).toEqual([1, 2, 3, 5, 4]);
  });

  it('rejects unknown tokens and out-of-range pages', () => {
    expect(() => parsePdfPageSelection('0', 2)).toThrow('Page "0" is outside this PDF.');
    expect(() => parsePdfPageSelection('1-cat', 2)).toThrow('Could not read page range "1-cat".');
    expect(() => parsePdfPageSelection('1-3', 2)).toThrow('Page range "1-3" is outside this PDF.');
  });

  it('summarizes long selections without shifting layout with huge labels', () => {
    expect(summarizePdfPageSelection([1, 2, 3], 8)).toBe('1, 2, 3');
    expect(summarizePdfPageSelection([1, 2, 3, 4, 5], 3)).toBe('1, 2, 3, +2 more');
  });
});
