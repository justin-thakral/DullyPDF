import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FillLinkResponse } from '../../../src/services/api';
import { useWorkspaceFillLinks } from '../../../src/hooks/useWorkspaceFillLinks';
import {
  FILL_LINK_LINK_ID_KEY,
  FILL_LINK_RESPONSE_ID_KEY,
  FILL_LINK_RESPONDENT_LABEL_KEY,
  FILL_LINK_SUBMITTED_AT_KEY,
} from '../../../src/utils/fillLinks';

const useFillLinksMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/hooks/useFillLinks', () => ({
  useFillLinks: useFillLinksMock,
}));

function createTemplateFillLinkState(overrides: Record<string, unknown> = {}) {
  return {
    activeLink: {
      id: 'link-1',
      scopeType: 'template',
      templateName: 'Template One',
      status: 'active',
      responseCount: 1,
      requireAllFields: false,
    },
    responses: [
      {
        id: 'resp-1',
        linkId: 'link-1',
        respondentLabel: 'Ada Lovelace',
        answers: { full_name: 'Ada Lovelace' },
        submittedAt: '2026-03-10T12:00:00.000Z',
      },
    ],
    loading: false,
    publishing: false,
    closing: false,
    responsesLoading: false,
    error: null,
    clear: vi.fn(),
    refreshForScope: vi.fn().mockResolvedValue(null),
    publish: vi.fn(),
    closeLink: vi.fn(),
    reopenLink: vi.fn(),
    refreshResponses: vi.fn(),
    searchResponses: vi.fn(),
    loadAllResponses: vi.fn().mockRejectedValue(new Error('Response fetch failed.')),
    ...overrides,
  };
}

function createGroupFillLinkState(overrides: Record<string, unknown> = {}) {
  return {
    activeLink: null,
    responses: [],
    loading: false,
    publishing: false,
    closing: false,
    responsesLoading: false,
    error: null,
    clear: vi.fn(),
    refreshForScope: vi.fn().mockResolvedValue(null),
    publish: vi.fn(),
    closeLink: vi.fn(),
    reopenLink: vi.fn(),
    refreshResponses: vi.fn(),
    searchResponses: vi.fn(),
    loadAllResponses: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function createField(name: string) {
  return {
    id: `${name}-id`,
    name,
    type: 'text',
    page: 1,
    rect: { x: 10, y: 10, width: 100, height: 20 },
    value: null,
  };
}

function renderHarness(overrides: Record<string, unknown> = {}) {
  const setManagerOpen = vi.fn();
  const setBannerNotice = vi.fn();
  const applyStructuredDataSource = vi.fn();
  const clearFieldValues = vi.fn();
  const handleFieldsChange = vi.fn();
  const enterFillDisplayMode = vi.fn();
  const setSearchFillPreset = vi.fn();
  const setShowSearchFill = vi.fn();
  const bumpSearchFillSession = vi.fn();

  let latestHook: ReturnType<typeof useWorkspaceFillLinks> | null = null;
  const hookProps = {
    verifiedUser: { uid: 'user-1' },
    profileLimits: {
      detectMaxPages: 10,
      fillableMaxPages: 10,
      savedFormsMax: 10,
      fillLinkResponsesMonthlyMax: 1000,
    },
    managerOpen: true,
    setManagerOpen,
    setBannerNotice,
    activeTemplateId: 'tpl-1',
    activeTemplateName: 'Template One',
    activeGroupId: null,
    activeGroupName: null,
    activeGroupTemplates: [],
    fields: [createField('full_name')],
    checkboxRules: [],
    textTransformRules: [{ targetField: 'full_name', operation: 'copy', sources: ['full_name'] }],
    savedFillLinkPublishFingerprint: null,
    resolveGroupTemplateDirtyNames: () => [],
    ensureGroupTemplateSnapshot: vi.fn(),
    applyStructuredDataSource,
    clearFieldValues,
    handleFieldsChange,
    enterFillDisplayMode,
    setSearchFillPreset,
    setShowSearchFill,
    bumpSearchFillSession,
    ...overrides,
  };

  function Harness() {
    latestHook = useWorkspaceFillLinks(hookProps);
    return null;
  }

  render(<Harness />);

  return {
    setManagerOpen,
    setBannerNotice,
    applyStructuredDataSource,
    clearFieldValues,
    handleFieldsChange,
    enterFillDisplayMode,
    setSearchFillPreset,
    setShowSearchFill,
    bumpSearchFillSession,
    get hook() {
      if (!latestHook) {
        throw new Error('Hook not initialized');
      }
      return latestHook;
    },
  };
}

describe('useWorkspaceFillLinks', () => {
  beforeEach(() => {
    useFillLinksMock.mockReset();
    useFillLinksMock.mockImplementation(({ scopeType }: { scopeType: 'template' | 'group' }) => (
      scopeType === 'template' ? createTemplateFillLinkState() : createGroupFillLinkState()
    ));
  });

  it('applies a Fill By Link response directly without opening the Search & Fill popup', async () => {
    // Regression: the old implementation routed every "Apply to PDF" click
    // through ``openResponsesInSearchFill`` which loaded every response,
    // seeded a preset, and opened the popup. Any failure in that chain
    // surfaced as "popup opens but does not fill". The new contract is a
    // deterministic direct apply — no popup, no preset, no extra fetch.
    const templateState = createTemplateFillLinkState({
      activeLink: {
        id: 'link-1',
        scopeType: 'template',
        templateName: 'Template One',
        status: 'active',
        responseCount: 1,
        requireAllFields: false,
      },
      responses: [
        {
          id: 'resp-1',
          linkId: 'link-1',
          respondentLabel: 'Ada Lovelace',
          answers: { full_name: 'Ada Lovelace' },
          submittedAt: '2026-03-10T12:00:00.000Z',
        },
      ],
    });
    useFillLinksMock.mockImplementation(({ scopeType }: { scopeType: 'template' | 'group' }) => (
      scopeType === 'template' ? templateState : createGroupFillLinkState()
    ));

    const harness = renderHarness();
    const response = harness.hook.dialogProps.templateResponses[0] as FillLinkResponse;

    await act(async () => {
      await harness.hook.dialogProps.onApplyTemplateResponse(response);
    });

    // No popup-mediated handoff: loadAllResponses / applyStructuredDataSource /
    // setShowSearchFill stay silent because the fill happens inline.
    expect(templateState.loadAllResponses).not.toHaveBeenCalled();
    expect(harness.applyStructuredDataSource).not.toHaveBeenCalled();
    expect(harness.setShowSearchFill).not.toHaveBeenCalled();
    expect(harness.setSearchFillPreset).not.toHaveBeenCalled();

    // But the PDF fields DID get updated and the manager closed.
    expect(harness.handleFieldsChange).toHaveBeenCalledTimes(1);
    expect(harness.setManagerOpen).toHaveBeenCalledWith(false);

    // UX guard: the workspace flips to fill-display mode so the user sees
    // the values immediately. This was the "why didn't anything happen?"
    // complaint from webform response apply.
    expect(harness.enterFillDisplayMode).toHaveBeenCalledTimes(1);
  });

  it('wipes existing field values before applying when "Clear First & Apply" is clicked', async () => {
    const templateState = createTemplateFillLinkState({
      activeLink: {
        id: 'link-1',
        scopeType: 'template',
        templateName: 'Template One',
        status: 'active',
        responseCount: 1,
        requireAllFields: false,
      },
      responses: [
        {
          id: 'resp-1',
          linkId: 'link-1',
          respondentLabel: 'Ada Lovelace',
          answers: { full_name: 'Ada Lovelace' },
          submittedAt: '2026-03-10T12:00:00.000Z',
        },
      ],
    });
    useFillLinksMock.mockImplementation(({ scopeType }: { scopeType: 'template' | 'group' }) => (
      scopeType === 'template' ? templateState : createGroupFillLinkState()
    ));

    const harness = renderHarness();
    const response = harness.hook.dialogProps.templateResponses[0] as FillLinkResponse;

    await act(async () => {
      await harness.hook.dialogProps.onApplyTemplateResponseWithClear!(response);
    });

    // Both the cleared baseline commit and the fill-mode switch fire.
    expect(harness.handleFieldsChange).toHaveBeenCalledTimes(1);
    expect(harness.enterFillDisplayMode).toHaveBeenCalledTimes(1);
    // Still no popup.
    expect(harness.setShowSearchFill).not.toHaveBeenCalled();
    expect(harness.setSearchFillPreset).not.toHaveBeenCalled();
  });

  it('surfaces an error banner when "Use respondents as Search & Fill" handoff fails', async () => {
    // The "Open Search & Fill" (bulk) flow still goes through the popup and
    // still needs its existing error-surfacing behavior intact.
    const harness = renderHarness();

    await act(async () => {
      await harness.hook.dialogProps.onUseTemplateResponsesAsSearchFill();
    });

    expect(harness.setBannerNotice).toHaveBeenCalledWith({
      tone: 'error',
      message: 'Response fetch failed.',
    });
    expect(harness.setShowSearchFill).not.toHaveBeenCalled();
  });

  it('does not prefetch Fill By Link data while the manager is closed', () => {
    const templateState = createTemplateFillLinkState();
    const groupState = createGroupFillLinkState();
    useFillLinksMock.mockImplementation(({ scopeType }: { scopeType: 'template' | 'group' }) => (
      scopeType === 'template' ? templateState : groupState
    ));

    renderHarness({ managerOpen: false });

    expect(templateState.refreshForScope).not.toHaveBeenCalled();
    expect(groupState.refreshForScope).not.toHaveBeenCalled();
  });

  it('does not imperatively refresh Fill By Link scopes from the workspace wrapper on open', () => {
    const templateState = createTemplateFillLinkState();
    const groupState = createGroupFillLinkState();
    useFillLinksMock.mockImplementation(({ scopeType }: { scopeType: 'template' | 'group' }) => (
      scopeType === 'template' ? templateState : groupState
    ));

    renderHarness({
      activeGroupId: 'group-1',
      activeGroupName: 'Hiring Packet',
      activeGroupTemplates: [
        {
          id: 'tpl-group-1',
          name: 'Offer Letter',
          createdAt: '2026-03-10T12:00:00.000Z',
        },
      ],
    });

    expect(templateState.refreshForScope).not.toHaveBeenCalled();
    expect(groupState.refreshForScope).not.toHaveBeenCalled();
  });

  it('keeps the manager open for group-only scopes when no template is active', () => {
    const templateState = createTemplateFillLinkState();
    const groupState = createGroupFillLinkState();
    useFillLinksMock.mockImplementation(({ scopeType }: { scopeType: 'template' | 'group' }) => (
      scopeType === 'template' ? templateState : groupState
    ));

    const harness = renderHarness({
      activeTemplateId: null,
      activeTemplateName: null,
      activeGroupId: 'group-1',
      activeGroupName: 'Hiring Packet',
      activeGroupTemplates: [
        {
          id: 'tpl-group-1',
          name: 'Offer Letter',
          createdAt: '2026-03-10T12:00:00.000Z',
        },
      ],
    });

    expect(templateState.refreshForScope).not.toHaveBeenCalled();
    expect(groupState.refreshForScope).not.toHaveBeenCalled();
    expect(harness.setManagerOpen).not.toHaveBeenCalled();
    expect(harness.hook.dialogProps.open).toBe(true);
  });

  it('shows a save-first banner for unsaved draft templates', () => {
    const harness = renderHarness({
      managerOpen: false,
      activeTemplateId: null,
      activeTemplateName: 'Draft Template',
    });

    expect(harness.hook.canTriggerFillLink).toBe(true);

    act(() => {
      harness.hook.handleOpenFillLinkManager();
    });

    expect(harness.setBannerNotice).toHaveBeenCalledWith({
      tone: 'error',
      message: 'Save form first to share link.',
      autoDismissMs: 7000,
    });
    expect(harness.setManagerOpen).not.toHaveBeenCalled();
  });

  it('publishes template links with respondent download settings and current template fill rules', async () => {
    const templateState = createTemplateFillLinkState({
      activeLink: null,
    });
    useFillLinksMock.mockImplementation(({ scopeType }: { scopeType: 'template' | 'group' }) => (
      scopeType === 'template' ? templateState : createGroupFillLinkState()
    ));

    const harness = renderHarness();

    await act(async () => {
      await harness.hook.dialogProps.onPublishTemplate({
        requireAllFields: true,
        allowRespondentPdfDownload: true,
      });
    });

    expect(templateState.publish).toHaveBeenCalledWith({
      scopeType: 'template',
      templateId: 'tpl-1',
      templateName: 'Template One',
      title: 'Template One',
      requireAllFields: true,
      allowRespondentPdfDownload: true,
      allowRespondentEditablePdfDownload: false,
      fields: [
        expect.objectContaining({
          name: 'full_name',
          type: 'text',
          page: 1,
        }),
      ],
      checkboxRules: [],
      textTransformRules: [{ targetField: 'full_name', operation: 'copy', sources: ['full_name'] }],
      webFormConfig: undefined,
      signingConfig: undefined,
    });
  });

  it('reopens closed template links while preserving the saved respondent download setting', async () => {
    const templateState = createTemplateFillLinkState({
      activeLink: {
        id: 'link-1',
        scopeType: 'template',
        templateName: 'Template One',
        status: 'closed',
        responseCount: 1,
        requireAllFields: false,
        respondentPdfDownloadEnabled: true,
      },
    });
    useFillLinksMock.mockImplementation(({ scopeType }: { scopeType: 'template' | 'group' }) => (
      scopeType === 'template' ? templateState : createGroupFillLinkState()
    ));

    const harness = renderHarness();

    await act(async () => {
      await harness.hook.dialogProps.onCloseTemplateLink({
        requireAllFields: true,
      });
    });

    expect(templateState.reopenLink).toHaveBeenCalledWith('link-1', {
      title: 'Template One',
      requireAllFields: true,
      allowRespondentPdfDownload: true,
      allowRespondentEditablePdfDownload: false,
      fields: [
        expect.objectContaining({
          name: 'full_name',
          type: 'text',
          page: 1,
        }),
      ],
      checkboxRules: [],
      textTransformRules: [{ targetField: 'full_name', operation: 'copy', sources: ['full_name'] }],
      webFormConfig: undefined,
      signingConfig: undefined,
    });
  });
});
