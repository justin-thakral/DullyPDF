import { ApiError } from '../services/apiConfig';

const PDF_DOWNLOAD_LIMIT_CODE = 'pdf_download_limit_reached';

type PdfDownloadLimitDetail = {
  code?: string;
  message?: string;
  monthlyLimit?: number;
  currentMonthUsage?: number;
  downloadsRemaining?: number;
  monthKey?: string;
  pdfCount?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function detailFromPayload(payload: unknown): PdfDownloadLimitDetail | null {
  if (!isRecord(payload)) return null;
  const detail = payload.detail;
  if (isRecord(detail)) {
    return detail as PdfDownloadLimitDetail;
  }
  return payload as PdfDownloadLimitDetail;
}

export function buildPdfDownloadRequestId(): string {
  const cryptoApi =
    typeof globalThis !== 'undefined' && typeof globalThis.crypto !== 'undefined'
      ? globalThis.crypto
      : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `pdf_download_${cryptoApi.randomUUID()}`;
  }
  const randomSuffix = Math.random().toString(36).slice(2, 12);
  return `pdf_download_${Date.now()}_${randomSuffix}`;
}

export function getPdfDownloadLimitDetail(error: unknown): PdfDownloadLimitDetail | null {
  if (!(error instanceof ApiError) && !isRecord(error)) return null;
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
  const payload = isRecord(error) ? error.payload : undefined;
  const detail = detailFromPayload(payload);
  if (code === PDF_DOWNLOAD_LIMIT_CODE || detail?.code === PDF_DOWNLOAD_LIMIT_CODE) {
    return detail || {};
  }
  return null;
}

export function isPdfDownloadLimitError(error: unknown): boolean {
  return getPdfDownloadLimitDetail(error) !== null;
}

export function formatPdfDownloadLimitMessage(
  error: unknown,
  options: { groupDownload?: boolean } = {},
): string {
  const detail = getPdfDownloadLimitDetail(error);
  const monthlyLimit = typeof detail?.monthlyLimit === 'number' && Number.isFinite(detail.monthlyLimit)
    ? Math.max(0, Math.floor(detail.monthlyLimit))
    : 25;
  const pdfCount = typeof detail?.pdfCount === 'number' && Number.isFinite(detail.pdfCount)
    ? Math.max(1, Math.floor(detail.pdfCount))
    : 1;
  const base = `You have used all ${monthlyLimit} generated PDF downloads for this month. Upgrade to Premium for unlimited downloads.`;
  if (options.groupDownload && pdfCount > 1) {
    return `${base} This group export needs ${pdfCount} downloads.`;
  }
  return base;
}
