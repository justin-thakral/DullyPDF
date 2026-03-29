import { describe, expect, it } from 'vitest';

import { hashSourcePdfSha256, resolveSourcePdfSha256 } from '../../../src/utils/pdfFingerprint';

describe('pdfFingerprint', () => {
  it('hashes ArrayBuffer and byte sources consistently', async () => {
    const expected = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';

    await expect(hashSourcePdfSha256(new Uint8Array([1, 2, 3, 4]))).resolves.toBe(expected);
    await expect(hashSourcePdfSha256(new Uint8Array([1, 2, 3, 4]).buffer)).resolves.toBe(expected);
    await expect(resolveSourcePdfSha256(async () => new Uint8Array([1, 2, 3, 4]))).resolves.toBe(expected);
  });

  it('wraps resolver failures with the standard verification message', async () => {
    await expect(
      resolveSourcePdfSha256(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('Unable to verify the active PDF. Reload the document and try again.');
  });
});
