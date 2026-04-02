import { act, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImageFill, estimateImageFillCredits } from '../../../src/hooks/useImageFill';
import type { PdfField } from '../../../src/types';

const extractFromDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/api', () => ({
  ApiService: {
    extractFromDocuments: extractFromDocumentsMock,
  },
}));

vi.mock('../../../src/services/apiConfig', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

function createField(overrides: Partial<PdfField> = {}): PdfField {
  return {
    id: 'field-1',
    name: 'first_name',
    type: 'text',
    page: 1,
    rect: { x: 10, y: 10, width: 120, height: 24 },
    value: null,
    ...overrides,
  };
}

function renderHookHarness(options: {
  fields?: PdfField[];
  sessionId?: string | null;
} = {}) {
  let latest: ReturnType<typeof useImageFill> | null = null;
  const onUpdateField = vi.fn();
  const onLoadUserProfile = vi.fn();

  function Harness() {
    const fieldsRef = useRef<PdfField[]>(options.fields ?? [createField()]);
    latest = useImageFill({
      fieldsRef,
      sessionId: 'sessionId' in options ? options.sessionId! : 'session-1',
      onUpdateField,
      onLoadUserProfile,
    });
    return null;
  }

  render(<Harness />);
  return { getLatest: () => latest!, onUpdateField, onLoadUserProfile };
}

beforeEach(() => {
  extractFromDocumentsMock.mockReset();
});

describe('useImageFill', () => {
  it('starts closed with empty state', () => {
    const { getLatest } = renderHookHarness();
    expect(getLatest().open).toBe(false);
    expect(getLatest().files).toEqual([]);
    expect(getLatest().extractedFields).toEqual([]);
    expect(getLatest().loading).toBe(false);
    expect(getLatest().error).toBeNull();
  });

  it('openDialog sets open to true and resets state', () => {
    const { getLatest } = renderHookHarness();
    act(() => getLatest().openDialog());
    expect(getLatest().open).toBe(true);
    expect(getLatest().files).toEqual([]);
    expect(getLatest().error).toBeNull();
  });

  it('closeDialog sets open to false', () => {
    const { getLatest } = renderHookHarness();
    act(() => getLatest().openDialog());
    expect(getLatest().open).toBe(true);
    act(() => getLatest().closeDialog());
    expect(getLatest().open).toBe(false);
  });

  it('addFiles appends files', () => {
    const { getLatest } = renderHookHarness();
    const file1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const file2 = new File(['b'], 'b.png', { type: 'image/png' });
    act(() => getLatest().addFiles([file1]));
    expect(getLatest().files).toHaveLength(1);
    act(() => getLatest().addFiles([file2]));
    expect(getLatest().files).toHaveLength(2);
    expect(getLatest().files[0].name).toBe('a.jpg');
    expect(getLatest().files[1].name).toBe('b.png');
  });

  it('removeFile removes by index', () => {
    const { getLatest } = renderHookHarness();
    const file1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const file2 = new File(['b'], 'b.png', { type: 'image/png' });
    act(() => getLatest().addFiles([file1, file2]));
    expect(getLatest().files).toHaveLength(2);
    act(() => getLatest().removeFile(0));
    expect(getLatest().files).toHaveLength(1);
    expect(getLatest().files[0].name).toBe('b.png');
  });

  it('runExtraction sets error when no fields', async () => {
    const { getLatest } = renderHookHarness({ fields: [] });
    const file = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    await act(async () => getLatest().runExtraction([file]));
    expect(getLatest().error).toMatch(/No fields defined/);
    expect(extractFromDocumentsMock).not.toHaveBeenCalled();
  });

  it('runExtraction sets error when no session', async () => {
    extractFromDocumentsMock.mockRejectedValue(new Error('should not be called'));
    const { getLatest } = renderHookHarness({ sessionId: null });
    const file = new File(['a'], 'a.jpg', { type: 'image/jpeg' });

    await act(async () => getLatest().runExtraction([file]));

    expect(getLatest().error).toMatch(/No active session/);
    expect(extractFromDocumentsMock).not.toHaveBeenCalled();
  });

  it('runExtraction sets error when no files', async () => {
    const { getLatest } = renderHookHarness();
    await act(async () => getLatest().runExtraction([]));
    expect(getLatest().error).toMatch(/No files uploaded/);
  });

  it('runExtraction calls API and populates extracted fields', async () => {
    extractFromDocumentsMock.mockResolvedValue({
      success: true,
      fields: [
        { fieldName: 'first_name', value: 'John', confidence: 95 },
      ],
    });

    const { getLatest, onLoadUserProfile } = renderHookHarness();
    const file = new File(['img'], 'id.jpg', { type: 'image/jpeg' });

    await act(async () => getLatest().runExtraction([file]));

    expect(extractFromDocumentsMock).toHaveBeenCalledTimes(1);
    const call = extractFromDocumentsMock.mock.calls[0][0];
    expect(call.sessionId).toBe('session-1');
    expect(call.files).toEqual([file]);
    expect(call.fields[0].name).toBe('first_name');

    expect(getLatest().extractedFields).toHaveLength(1);
    expect(getLatest().extractedFields[0].fieldName).toBe('first_name');
    expect(getLatest().extractedFields[0].value).toBe('John');
    expect(getLatest().extractedFields[0].confidence).toBe(95);
    expect(getLatest().extractedFields[0].rejected).toBe(false);
    expect(getLatest().loading).toBe(false);
    expect(onLoadUserProfile).toHaveBeenCalled();
  });

  it('runExtraction sets error on API failure', async () => {
    extractFromDocumentsMock.mockRejectedValue(new Error('Network error'));

    const { getLatest } = renderHookHarness();
    const file = new File(['img'], 'id.jpg', { type: 'image/jpeg' });

    await act(async () => getLatest().runExtraction([file]));

    expect(getLatest().error).toBe('Network error');
    expect(getLatest().loading).toBe(false);
  });

  it('runExtraction sets error on unsuccessful result', async () => {
    extractFromDocumentsMock.mockResolvedValue({ success: false });

    const { getLatest } = renderHookHarness();
    const file = new File(['img'], 'id.jpg', { type: 'image/jpeg' });

    await act(async () => getLatest().runExtraction([file]));

    expect(getLatest().error).toMatch(/No matching information/);
  });

  it('updateFieldValue updates value at index', async () => {
    extractFromDocumentsMock.mockResolvedValue({
      success: true,
      fields: [
        { fieldName: 'first_name', value: 'John', confidence: 95 },
        { fieldName: 'last_name', value: 'Doe', confidence: 90 },
      ],
    });

    const { getLatest } = renderHookHarness({
      fields: [
        createField({ id: 'f1', name: 'first_name' }),
        createField({ id: 'f2', name: 'last_name' }),
      ],
    });

    const file = new File(['img'], 'id.jpg', { type: 'image/jpeg' });
    await act(async () => getLatest().runExtraction([file]));

    act(() => getLatest().updateFieldValue(0, 'Jane'));
    expect(getLatest().extractedFields[0].value).toBe('Jane');
    expect(getLatest().extractedFields[1].value).toBe('Doe');
  });

  it('rejectField toggles rejected state', async () => {
    extractFromDocumentsMock.mockResolvedValue({
      success: true,
      fields: [{ fieldName: 'first_name', value: 'John', confidence: 95 }],
    });

    const { getLatest } = renderHookHarness();
    const file = new File(['img'], 'id.jpg', { type: 'image/jpeg' });
    await act(async () => getLatest().runExtraction([file]));

    expect(getLatest().extractedFields[0].rejected).toBe(false);
    act(() => getLatest().rejectField(0));
    expect(getLatest().extractedFields[0].rejected).toBe(true);
    act(() => getLatest().rejectField(0));
    expect(getLatest().extractedFields[0].rejected).toBe(false);
  });

  it('applyFields calls onUpdateField for accepted fields and closes dialog', async () => {
    extractFromDocumentsMock.mockResolvedValue({
      success: true,
      fields: [
        { fieldName: 'first_name', value: 'John', confidence: 95 },
        { fieldName: 'last_name', value: 'Doe', confidence: 90 },
      ],
    });

    const fields = [
      createField({ id: 'f1', name: 'first_name' }),
      createField({ id: 'f2', name: 'last_name' }),
    ];
    const { getLatest, onUpdateField } = renderHookHarness({ fields });

    act(() => getLatest().openDialog());
    const file = new File(['img'], 'id.jpg', { type: 'image/jpeg' });
    await act(async () => getLatest().runExtraction([file]));

    // Reject last_name
    act(() => getLatest().rejectField(1));

    act(() => getLatest().applyFields());

    // Only first_name should be applied
    expect(onUpdateField).toHaveBeenCalledTimes(1);
    expect(onUpdateField).toHaveBeenCalledWith('f1', { value: 'John' });
    expect(getLatest().open).toBe(false);
  });

  it('applyFields converts checkbox values to boolean', async () => {
    extractFromDocumentsMock.mockResolvedValue({
      success: true,
      fields: [
        { fieldName: 'i_consent', value: 'true', confidence: 90 },
      ],
    });

    const fields = [
      createField({ id: 'cb1', name: 'i_consent', type: 'checkbox' }),
    ];
    const { getLatest, onUpdateField } = renderHookHarness({ fields });

    act(() => getLatest().openDialog());
    const file = new File(['img'], 'id.jpg', { type: 'image/jpeg' });
    await act(async () => getLatest().runExtraction([file]));
    act(() => getLatest().applyFields());

    expect(onUpdateField).toHaveBeenCalledWith('cb1', { value: true });
  });

  it('applyFields converts checkbox false', async () => {
    extractFromDocumentsMock.mockResolvedValue({
      success: true,
      fields: [
        { fieldName: 'i_consent', value: 'false', confidence: 90 },
      ],
    });

    const fields = [
      createField({ id: 'cb1', name: 'i_consent', type: 'checkbox' }),
    ];
    const { getLatest, onUpdateField } = renderHookHarness({ fields });

    act(() => getLatest().openDialog());
    const file = new File(['img'], 'id.jpg', { type: 'image/jpeg' });
    await act(async () => getLatest().runExtraction([file]));
    act(() => getLatest().applyFields());

    expect(onUpdateField).toHaveBeenCalledWith('cb1', { value: false });
  });

  it('runExtraction maps field rects correctly', async () => {
    extractFromDocumentsMock.mockResolvedValue({ success: true, fields: [] });

    const fields = [
      createField({
        id: 'f1',
        name: 'name',
        rect: { x: 10, y: 20, width: 100, height: 30 },
      }),
    ];
    const { getLatest } = renderHookHarness({ fields });
    const file = new File(['img'], 'id.jpg', { type: 'image/jpeg' });

    await act(async () => getLatest().runExtraction([file]));

    const sentFields = extractFromDocumentsMock.mock.calls[0][0].fields;
    expect(sentFields[0].rect).toEqual([10, 20, 110, 50]);
  });

  it('creditEstimate updates when files change', () => {
    const { getLatest } = renderHookHarness();
    expect(getLatest().creditEstimate.totalCredits).toBe(0);

    const img = new File(['a'], 'photo.jpg', { type: 'image/jpeg' });
    act(() => getLatest().addFiles([img]));
    expect(getLatest().creditEstimate.imageCount).toBe(1);
    expect(getLatest().creditEstimate.totalCredits).toBe(1);

    const pdf = new File(['b'], 'doc.pdf', { type: 'application/pdf' });
    act(() => getLatest().addFiles([pdf]));
    expect(getLatest().creditEstimate.imageCount).toBe(1);
    expect(getLatest().creditEstimate.docCount).toBe(1);
    expect(getLatest().creditEstimate.totalCredits).toBe(2);
  });
});

describe('estimateImageFillCredits', () => {
  it('returns zero for no files', () => {
    const est = estimateImageFillCredits([]);
    expect(est.totalCredits).toBe(0);
    expect(est.imageCount).toBe(0);
    expect(est.docCount).toBe(0);
  });

  it('counts images at 1 credit each', () => {
    const files = [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
      new File(['c'], 'c.gif', { type: 'image/gif' }),
    ];
    const est = estimateImageFillCredits(files);
    expect(est.imageCount).toBe(3);
    expect(est.imageCredits).toBe(3);
    expect(est.docCount).toBe(0);
    expect(est.totalCredits).toBe(3);
  });

  it('counts PDFs at 1 credit each (client-side estimate)', () => {
    const files = [
      new File(['a'], 'form.pdf', { type: 'application/pdf' }),
      new File(['b'], 'scan.PDF', { type: 'application/pdf' }),
    ];
    const est = estimateImageFillCredits(files);
    expect(est.imageCount).toBe(0);
    expect(est.docCount).toBe(2);
    expect(est.docCredits).toBe(2);
    expect(est.totalCredits).toBe(2);
  });

  it('handles mixed images and PDFs', () => {
    const files = [
      new File(['a'], 'photo.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'doc.pdf', { type: 'application/pdf' }),
      new File(['c'], 'scan.png', { type: 'image/png' }),
    ];
    const est = estimateImageFillCredits(files);
    expect(est.imageCount).toBe(2);
    expect(est.docCount).toBe(1);
    expect(est.totalCredits).toBe(3);
  });

  it('classifies by filename extension, not MIME type', () => {
    // A file with .pdf extension but wrong MIME should still count as doc
    const file = new File(['a'], 'report.pdf', { type: 'text/plain' });
    const est = estimateImageFillCredits([file]);
    expect(est.docCount).toBe(1);
    expect(est.imageCount).toBe(0);
  });
});
