import { act, render } from '@testing-library/react';
import { useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOpenAiPipeline, type UseOpenAiPipelineDeps } from '../../../src/hooks/useOpenAiPipeline';
import type { PdfField } from '../../../src/types';

const createSavedFormSessionMock = vi.hoisted(() => vi.fn());
const renameFieldsMock = vi.hoisted(() => vi.fn());
const mapSchemaMock = vi.hoisted(() => vi.fn());
const fetchDetectionStatusMock = vi.hoisted(() => vi.fn());
const resolveSourcePdfSha256Mock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/api', () => ({
  ApiService: {
    createSavedFormSession: createSavedFormSessionMock,
    renameFields: renameFieldsMock,
    mapSchema: mapSchemaMock,
  },
}));

vi.mock('../../../src/services/detectionApi', () => ({
  fetchDetectionStatus: fetchDetectionStatusMock,
}));

vi.mock('../../../src/utils/pdfFingerprint', () => ({
  resolveSourcePdfSha256: resolveSourcePdfSha256Mock,
}));

function createField(name = 'Field 1', overrides: Partial<PdfField> = {}): PdfField {
  return {
    id: 'field-1',
    name,
    type: 'text',
    page: 1,
    rect: { x: 10, y: 10, width: 120, height: 24 },
    value: null,
    ...overrides,
  };
}

function renderHookHarness(
  overrides: Partial<UseOpenAiPipelineDeps> = {},
  options: { initialFields?: PdfField[] } = {},
) {
  let latest: ReturnType<typeof useOpenAiPipeline> | null = null;
  const onBeforeOpenAiAction = vi.fn().mockResolvedValue(undefined);
  const setBannerNotice = vi.fn();
  let resetFieldHistory = vi.fn();
  let updateFieldsWith = vi.fn();

  function Harness() {
    const localFieldsRef = useRef<PdfField[]>(options.initialFields ?? [createField()]);
    const loadTokenRef = useRef(1);
    const pendingAutoActionsRef = useRef(null);
    const [detectSessionId, setDetectSessionId] = useState<string | null>(null);
    const [mappingSessionId, setMappingSessionId] = useState<string | null>(null);
    const {
      fieldsRef: overrideFieldsRef,
      detectSessionId: overrideDetectSessionId,
      setDetectSessionId: overrideSetDetectSessionId,
      setMappingSessionId: overrideSetMappingSessionId,
      pendingAutoActionsRef: overridePendingAutoActionsRef,
      ...restOverrides
    } = overrides;
    const activeFieldsRef = overrideFieldsRef ?? localFieldsRef;
    resetFieldHistory = vi.fn((fields?: PdfField[]) => {
      activeFieldsRef.current = fields ?? [];
    });
    updateFieldsWith = vi.fn((updater: (prev: PdfField[]) => PdfField[]) => {
      activeFieldsRef.current = updater(activeFieldsRef.current);
    });

    latest = useOpenAiPipeline({
      verifiedUser: { uid: 'user-1' } as any,
      fieldsRef: activeFieldsRef,
      loadTokenRef,
      detectSessionId: overrideDetectSessionId ?? detectSessionId,
      setDetectSessionId: overrideSetDetectSessionId ?? setDetectSessionId,
      setMappingSessionId: overrideSetMappingSessionId ?? setMappingSessionId,
      activeSavedFormId: 'saved-form-1',
      pageCount: 3,
      dataColumns: ['first_name'],
      schemaId: 'schema-1',
      pendingAutoActionsRef: overridePendingAutoActionsRef ?? pendingAutoActionsRef,
      setBannerNotice,
      requestConfirm: vi.fn().mockResolvedValue(true),
      resolveSourcePdfBytes: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      loadUserProfile: vi.fn().mockResolvedValue(null),
      resetFieldHistory,
      updateFieldsWith,
      setIdentifierKey: vi.fn(),
      onBeforeOpenAiAction,
      hasDocument: true,
      fieldsCount: activeFieldsRef.current.length,
      dataSourceKind: 'csv',
      hasSchemaOrPending: true,
      ...restOverrides,
    });
    void mappingSessionId;
    return null;
  }

  render(<Harness />);

  return {
    resetFieldHistory,
    updateFieldsWith,
    onBeforeOpenAiAction,
    setBannerNotice,
    get current() {
      if (!latest) {
        throw new Error('hook not initialized');
      }
      return latest;
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe('useOpenAiPipeline', () => {
  beforeEach(() => {
    createSavedFormSessionMock.mockReset();
    renameFieldsMock.mockReset();
    mapSchemaMock.mockReset();
    fetchDetectionStatusMock.mockReset();
    resolveSourcePdfSha256Mock.mockReset();
    resolveSourcePdfSha256Mock.mockResolvedValue('a'.repeat(64));
  });

  it('recreates the saved-form session lazily before rename when prewarm failed', async () => {
    createSavedFormSessionMock.mockResolvedValue({ sessionId: 'saved-session-1' });
    renameFieldsMock.mockResolvedValue({
      success: true,
      fields: [{ originalName: 'Field 1', name: 'Renamed Field' }],
      checkboxRules: [],
    });
    mapSchemaMock.mockResolvedValue({ success: true });
    fetchDetectionStatusMock.mockResolvedValue({ status: 'complete' });

    const hook = renderHookHarness();

    expect(hook.current.canRename).toBe(true);

    await act(async () => {
      await hook.current.runOpenAiRename({ confirm: false });
    });

    expect(createSavedFormSessionMock).toHaveBeenCalledWith(
      'saved-form-1',
      expect.objectContaining({
        pageCount: 3,
        fields: [expect.objectContaining({ name: 'Field 1' })],
      }),
    );
    expect(renameFieldsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'saved-session-1',
        sourcePdfSha256: 'a'.repeat(64),
        templateFields: [expect.objectContaining({ name: 'Field 1' })],
      }),
    );
    expect(hook.onBeforeOpenAiAction).toHaveBeenCalledWith('rename', 'saved-session-1');
    expect(hook.resetFieldHistory).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Renamed Field' }),
    ]);
  });

  it('captures the active session diagnostic before schema mapping requests', async () => {
    mapSchemaMock.mockResolvedValue({
      success: true,
      mappingResults: { mappings: [] },
    });

    const hook = renderHookHarness({
      detectSessionId: 'detect-session-1',
      activeSavedFormId: null,
    });

    await act(async () => {
      const mapped = await hook.current.applySchemaMappings();
      expect(mapped).toBe(true);
    });

    expect(hook.onBeforeOpenAiAction).toHaveBeenCalledWith('map', 'detect-session-1');
    expect(mapSchemaMock).toHaveBeenCalledWith(
      'schema-1',
      [expect.objectContaining({ name: 'Field 1' })],
      undefined,
      'detect-session-1',
      undefined,
      'a'.repeat(64),
    );
  });

  it('derives radio suggestions from rename checkbox rules', async () => {
    createSavedFormSessionMock.mockResolvedValue({ sessionId: 'saved-session-1' });
    renameFieldsMock.mockResolvedValue({
      success: true,
      fields: [
        {
          originalName: 'status_single',
          name: 'i_marital_status_single',
          groupKey: 'marital_status',
          optionKey: 'single',
          optionLabel: 'Single',
          groupLabel: 'Marital Status',
        },
        {
          originalName: 'status_married',
          name: 'i_marital_status_married',
          groupKey: 'marital_status',
          optionKey: 'married',
          optionLabel: 'Married',
          groupLabel: 'Marital Status',
        },
      ],
      checkboxRules: [
        {
          groupKey: 'marital_status',
          operation: 'enum',
          databaseField: 'marital_status',
          confidence: 0.82,
        },
      ],
    });

    const hook = renderHookHarness({}, {
      initialFields: [
        createField('status_single', {
          id: 'single',
          type: 'checkbox',
          groupKey: 'marital_status',
        }),
        createField('status_married', {
          id: 'married',
          type: 'checkbox',
          groupKey: 'marital_status',
          rect: { x: 40, y: 10, width: 120, height: 24 },
        }),
      ],
    });

    await act(async () => {
      await hook.current.runOpenAiRename({ confirm: false });
    });

    expect(hook.current.checkboxRules).toHaveLength(1);
    expect(hook.current.radioGroupSuggestions).toEqual([
      expect.objectContaining({
        id: 'rule_marital_status',
        groupKey: 'marital_status',
        sourceField: 'marital_status',
        selectionReason: 'enum',
      }),
    ]);
    expect(hook.current.radioGroupSuggestions[0]?.suggestedFields).toEqual([
      expect.objectContaining({ fieldId: 'single', optionKey: 'single', optionLabel: 'Single' }),
      expect.objectContaining({ fieldId: 'married', optionKey: 'married', optionLabel: 'Married' }),
    ]);
  });

  it('reports rename as the active OpenAI action while the first rename request is running', async () => {
    const renameDeferred = createDeferred<any>();
    createSavedFormSessionMock.mockResolvedValue({ sessionId: 'saved-session-1' });
    renameFieldsMock.mockImplementation(() => renameDeferred.promise);

    const hook = renderHookHarness();

    let renamePromise: Promise<PdfField[] | null> | null = null;
    await act(async () => {
      renamePromise = hook.current.runOpenAiRename({ confirm: false });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.current.renameDisabledReason).toBe('Rename is already running.');
    expect(hook.current.mapSchemaDisabledReason).toBe('Rename is already running.');

    await act(async () => {
      renameDeferred.resolve({
        success: true,
        fields: [{ originalName: 'Field 1', name: 'Renamed Field' }],
        checkboxRules: [],
      });
      await renamePromise;
    });
  });

  it('reports mapping as the active OpenAI action while the first mapping request is running', async () => {
    const mappingDeferred = createDeferred<any>();
    mapSchemaMock.mockImplementation(() => mappingDeferred.promise);

    const hook = renderHookHarness({
      detectSessionId: 'detect-session-1',
      activeSavedFormId: null,
    });

    let mappingPromise: Promise<void> | null = null;
    await act(async () => {
      mappingPromise = hook.current.handleMapSchema(async () => 'schema-1');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.current.renameDisabledReason).toBe('Mapping is already running.');
    expect(hook.current.mapSchemaDisabledReason).toBe('Mapping is already running.');

    await act(async () => {
      mappingDeferred.resolve({
        success: true,
        mappingResults: { mappings: [] },
      });
      await mappingPromise;
    });
  });

  it('runs schema mapping after rename in the combined flow', async () => {
    createSavedFormSessionMock.mockResolvedValue({ sessionId: 'saved-session-1' });
    renameFieldsMock.mockResolvedValue({
      success: true,
      fields: [{ originalName: 'Field 1', name: 'Renamed Field' }],
      checkboxRules: [],
    });
    mapSchemaMock.mockResolvedValue({
      success: true,
      mappingResults: {
        mappings: [{ originalPdfField: 'Renamed Field', pdfField: 'mapped_name', confidence: 0.91 }],
        checkboxRules: [],
        radioGroupSuggestions: [],
        textTransformRules: [],
      },
    });

    const hook = renderHookHarness();

    await act(async () => {
      await hook.current.handleRenameAndMap(async () => 'schema-1');
    });

    expect(renameFieldsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'saved-session-1',
        schemaId: 'schema-1',
      }),
    );
    expect(mapSchemaMock).toHaveBeenCalledWith(
      'schema-1',
      [expect.objectContaining({ name: 'Renamed Field' })],
      'saved-form-1',
      'saved-session-1',
      undefined,
      'a'.repeat(64),
    );
    expect(hook.resetFieldHistory).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: 'mapped_name' }),
    ]);
  });

  it('clears existing field values when rename changes the template definition', async () => {
    createSavedFormSessionMock.mockResolvedValue({ sessionId: 'saved-session-1' });
    renameFieldsMock.mockResolvedValue({
      success: true,
      fields: [{ originalName: 'Field 1', name: 'Renamed Field' }],
      checkboxRules: [],
    });

    const hook = renderHookHarness({}, {
      initialFields: [createField('Field 1', { value: 'Justin Example' })],
    });

    await act(async () => {
      await hook.current.runOpenAiRename({ confirm: false });
    });

    expect(hook.resetFieldHistory).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Renamed Field', value: null }),
    ]);
    expect(hook.setBannerNotice).toHaveBeenCalledWith(expect.objectContaining({
      tone: 'info',
      message: expect.stringContaining('Current field inputs were cleared because the template definition changed.'),
    }));
  });

  it('clears existing field values when mapping changes the template definition', async () => {
    mapSchemaMock.mockResolvedValue({
      success: true,
      mappingResults: {
        mappings: [{ originalPdfField: 'Field 1', pdfField: 'mapped_name', confidence: 0.91 }],
        checkboxRules: [],
        radioGroupSuggestions: [],
        textTransformRules: [],
      },
    });

    const hook = renderHookHarness({
      detectSessionId: 'detect-session-1',
      activeSavedFormId: null,
    }, {
      initialFields: [createField('Field 1', { value: 'Justin Example' })],
    });

    await act(async () => {
      const mapped = await hook.current.applySchemaMappings();
      expect(mapped).toBe(true);
    });

    expect(hook.resetFieldHistory).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'mapped_name', value: null }),
    ]);
  });

  it('infers radio suggestions from renamed checkbox layouts when rename returns no rules', async () => {
    createSavedFormSessionMock.mockResolvedValue({ sessionId: 'saved-session-1' });
    renameFieldsMock.mockResolvedValue({
      success: true,
      fields: [
        {
          originalName: 'status_single',
          name: 'i_marital_status_single',
          groupKey: 'marital_status',
          optionKey: 'single',
          optionLabel: 'Single',
          groupLabel: 'Marital Status',
          renameConfidence: 0.92,
        },
        {
          originalName: 'status_married',
          name: 'i_marital_status_married',
          groupKey: 'marital_status',
          optionKey: 'married',
          optionLabel: 'Married',
          groupLabel: 'Marital Status',
          renameConfidence: 0.92,
        },
        {
          originalName: 'status_divorced',
          name: 'i_marital_status_divorced',
          groupKey: 'marital_status',
          optionKey: 'divorced',
          optionLabel: 'Divorced',
          groupLabel: 'Marital Status',
          renameConfidence: 0.92,
        },
      ],
      checkboxRules: [],
    });

    const hook = renderHookHarness({}, {
      initialFields: [
        createField('status_single', {
          id: 'single',
          type: 'checkbox',
          rect: { x: 10, y: 10, width: 14, height: 14 },
        }),
        createField('status_married', {
          id: 'married',
          type: 'checkbox',
          rect: { x: 40, y: 10, width: 14, height: 14 },
        }),
        createField('status_divorced', {
          id: 'divorced',
          type: 'checkbox',
          rect: { x: 70, y: 10, width: 14, height: 14 },
        }),
      ],
    });

    await act(async () => {
      await hook.current.runOpenAiRename({ confirm: false });
    });

    expect(hook.current.radioGroupSuggestions).toEqual([
      expect.objectContaining({
        id: 'inferred_marital_status',
        groupKey: 'marital_status',
        selectionReason: 'label_pattern',
      }),
    ]);
  });
});
