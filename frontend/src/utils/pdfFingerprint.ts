type PdfFingerprintSource = Blob | Uint8Array | ArrayBuffer;
type OwnedPdfBytes = Uint8Array<ArrayBuffer>;

function hasArrayBufferReader(value: unknown): value is { arrayBuffer: () => Promise<ArrayBuffer> } {
  return Boolean(value) && typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function';
}

export function clonePdfBytes(bytes: Uint8Array): OwnedPdfBytes {
  const cloned = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  cloned.set(bytes);
  return cloned;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function toUint8Array(source: PdfFingerprintSource): Promise<OwnedPdfBytes> {
  if (source instanceof Uint8Array) {
    return clonePdfBytes(source);
  }
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source.slice(0));
  }
  if (hasArrayBufferReader(source)) {
    return new Uint8Array(await source.arrayBuffer());
  }
  if (typeof Response !== 'undefined') {
    return new Uint8Array(await new Response(source as Blob).arrayBuffer());
  }
  throw new Error('PDF fingerprint source must expose bytes or arrayBuffer().');
}

export async function hashSourcePdfSha256(source: PdfFingerprintSource): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto is unavailable in this browser context.');
  }
  const digest = await subtle.digest('SHA-256', await toUint8Array(source));
  return bytesToHex(new Uint8Array(digest));
}

export async function resolveSourcePdfSha256(
  resolveSource: () => Promise<PdfFingerprintSource>,
  options: {
    onError?: (error: unknown) => void;
    failureMessage?: string;
  } = {},
): Promise<string> {
  try {
    return await hashSourcePdfSha256(await resolveSource());
  } catch (error) {
    options.onError?.(error);
    throw new Error(options.failureMessage || 'Unable to verify the active PDF. Reload the document and try again.');
  }
}
