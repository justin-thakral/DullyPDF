import { useCallback, useRef, useState } from 'react';
import type { PdfField } from '../types';
import { ApiService } from '../services/api';
import { ApiError } from '../services/apiConfig';

export type ExtractedField = {
  fieldName: string;
  value: string;
  confidence: number;
  rejected: boolean;
};

export type ImageFillCreditEstimate = {
  imageCount: number;
  docCount: number;
  imageCredits: number;
  docCredits: number;
  totalCredits: number;
};

export type ImageFillState = {
  open: boolean;
  files: File[];
  extractedFields: ExtractedField[];
  loading: boolean;
  error: string | null;
  creditEstimate: ImageFillCreditEstimate;
};

const IMAGE_FILL_DOC_BUCKET_SIZE = 5;

function isPdfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf');
}

/**
 * Estimate credit cost from uploaded files.
 * Image = 1 credit. PDF = 1 credit per 5 pages (estimated as 1 credit per doc client-side,
 * since we can't count PDF pages in the browser without parsing).
 */
export function estimateImageFillCredits(files: File[]): ImageFillCreditEstimate {
  let imageCount = 0;
  let docCount = 0;
  for (const file of files) {
    if (isPdfFile(file)) {
      docCount += 1;
    } else {
      imageCount += 1;
    }
  }
  // Client-side we estimate each PDF as 1 credit (min, since we can't count pages).
  // The actual cost may be higher for multi-page PDFs.
  const imageCredits = imageCount;
  const docCredits = docCount;
  return {
    imageCount,
    docCount,
    imageCredits,
    docCredits,
    totalCredits: imageCredits + docCredits,
  };
}

export function useImageFill(deps: {
  fieldsRef: React.RefObject<PdfField[]>;
  sessionId: string | null;
  onUpdateField: (fieldId: string, updates: Partial<PdfField>) => void;
  onLoadUserProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const openDialog = useCallback(() => {
    setOpen(true);
    setFiles([]);
    setExtractedFields([]);
    setError(null);
    setLoading(false);
  }, []);

  const closeDialog = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setOpen(false);
    setFiles([]);
    setExtractedFields([]);
    setError(null);
    setLoading(false);
  }, []);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const runExtraction = useCallback(async (filesToProcess: File[]) => {
    const fields = deps.fieldsRef.current;
    if (!fields || fields.length === 0) {
      setError('No fields defined on template. Detect and name fields first.');
      return;
    }
    if (!deps.sessionId) {
      setError('No active session. Upload a PDF first.');
      return;
    }
    if (filesToProcess.length === 0) {
      setError('No files uploaded.');
      return;
    }

    setLoading(true);
    setError(null);
    setExtractedFields([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const fieldPayload = fields.map((f) => ({
        name: f.name,
        type: f.type,
        page: f.page,
        rect: f.rect ? [f.rect.x, f.rect.y, f.rect.x + f.rect.width, f.rect.y + f.rect.height] : undefined,
        groupKey: f.groupKey,
        optionKey: f.optionKey,
      }));

      const result = await ApiService.extractFromDocuments({
        sessionId: deps.sessionId,
        files: filesToProcess,
        fields: fieldPayload,
      }, { signal: controller.signal });

      if (result?.success && result.fields) {
        setExtractedFields(
          result.fields.map((f) => ({
            fieldName: f.fieldName,
            value: f.value,
            confidence: f.confidence,
            rejected: false,
          })),
        );
      } else {
        setError('No matching information found in the uploaded documents.');
      }

      void deps.onLoadUserProfile();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      let message = 'Failed to extract information from documents.';
      if (err instanceof ApiError && err.status === 402) {
        message = 'Insufficient OpenAI credits. Purchase more credits in your profile.';
      } else if (err instanceof ApiError && err.status === 429) {
        message = 'Rate limit exceeded. Please wait a moment and try again.';
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [deps]);

  const updateFieldValue = useCallback((index: number, value: string) => {
    setExtractedFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, value } : f)),
    );
  }, []);

  const rejectField = useCallback((index: number) => {
    setExtractedFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, rejected: !f.rejected } : f)),
    );
  }, []);

  const applyFields = useCallback(() => {
    const fields = deps.fieldsRef.current;
    if (!fields) return;

    const accepted = extractedFields.filter((ef) => !ef.rejected);
    for (const ef of accepted) {
      const matchingField = fields.find((f) => f.name === ef.fieldName);
      if (matchingField) {
        if (matchingField.type === 'checkbox') {
          const boolValue = ef.value.toLowerCase() === 'true' || ef.value === '1' || ef.value.toLowerCase() === 'yes';
          deps.onUpdateField(matchingField.id, { value: boolValue });
        } else {
          deps.onUpdateField(matchingField.id, { value: ef.value });
        }
      }
    }
    closeDialog();
  }, [extractedFields, deps, closeDialog]);

  const creditEstimate = estimateImageFillCredits(files);

  return {
    open,
    files,
    extractedFields,
    loading,
    error,
    creditEstimate,
    openDialog,
    closeDialog,
    addFiles,
    removeFile,
    runExtraction,
    updateFieldValue,
    rejectField,
    applyFields,
  };
}
