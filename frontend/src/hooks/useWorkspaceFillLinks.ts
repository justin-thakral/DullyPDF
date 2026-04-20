import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  BannerNotice,
  CheckboxRule,
  PdfField,
  TextTransformRule,
} from '../types';
import type {
  FillLinkGroupTemplatePayload,
  FillLinkQuestion,
  FillLinkResponse,
  FillLinkSigningConfig,
  FillLinkSummary,
  FillLinkTemplateFieldPayload,
  FillLinkWebFormConfig,
  ProfileLimits,
  SavedFormSummary,
} from '../services/api';
import type { FillLinkManagerDialogProps } from '../components/features/FillLinkManagerDialog';
import { useFillLinks } from './useFillLinks';
import {
  buildFillLinkPublishFingerprint,
  buildFillLinkResponseRows,
  buildFillLinkTemplateFields,
  FILL_LINK_RESPONSE_ID_KEY,
  FILL_LINK_RESPONDENT_LABEL_KEY,
  fillLinkRespondentPdfDownloadEnabled,
} from '../utils/fillLinks';
import {
  buildFillLinkQuestionsFromFields,
  mergeFillLinkQuestionSets,
} from '../utils/fillLinkWebForm';
import { applySearchFillRowToFieldsWithStats } from '../utils/searchFillApply';
import { buildSigningAnchorsFromFields, hasMeaningfulFillValues } from '../utils/signing';

type SearchFillPresetState = {
  query: string;
  searchKey?: string;
  searchMode?: 'contains' | 'equals';
  autoRun?: boolean;
  autoFillOnSearch?: boolean;
  highlightResult?: boolean;
  token: number;
} | null;

type GroupTemplateSnapshot = {
  fields: PdfField[];
  checkboxRules: CheckboxRule[];
};

type StructuredDataSourcePayload = {
  kind: 'respondent';
  label: string;
  rows: Array<Record<string, unknown>>;
  columns: string[];
  identifierKey: string;
};

type UseWorkspaceFillLinksDeps = {
  verifiedUser: unknown;
  profileLimits: ProfileLimits;
  managerOpen: boolean;
  setManagerOpen: Dispatch<SetStateAction<boolean>>;
  setBannerNotice: (notice: BannerNotice | null) => void;
  activeTemplateId: string | null;
  activeTemplateName: string | null;
  activeGroupId: string | null;
  activeGroupName: string | null;
  activeGroupTemplates: SavedFormSummary[];
  fields: PdfField[];
  checkboxRules: CheckboxRule[];
  textTransformRules: TextTransformRule[];
  savedFillLinkPublishFingerprint: string | null;
  resolveGroupTemplateDirtyNames: () => string[];
  ensureGroupTemplateSnapshot: (formId: string, templateNameHint?: string | null) => Promise<GroupTemplateSnapshot>;
  applyStructuredDataSource: (payload: StructuredDataSourcePayload) => void;
  clearFieldValues: () => void;
  handleFieldsChange: (next: PdfField[]) => void;
  // Called after a direct field apply (the "Apply to PDF" buttons on the
  // Fill By Link manager) to flip the workspace into its "fill" display
  // preset so the user actually sees the new values instead of a
  // names-only list view.
  enterFillDisplayMode: () => void;
  setSearchFillPreset: Dispatch<SetStateAction<SearchFillPresetState>>;
  setShowSearchFill: Dispatch<SetStateAction<boolean>>;
  bumpSearchFillSession: () => void;
};

type SearchFillLink = Pick<FillLinkSummary, 'id' | 'responseCount' | 'scopeType' | 'groupName' | 'templateName'> | null;

export function useWorkspaceFillLinks(deps: UseWorkspaceFillLinksDeps) {
  const {
    verifiedUser,
    profileLimits,
    managerOpen,
    setManagerOpen,
    setBannerNotice,
    activeTemplateId,
    activeTemplateName,
    activeGroupId,
    activeGroupName,
    activeGroupTemplates,
    fields,
    checkboxRules,
    textTransformRules,
    savedFillLinkPublishFingerprint,
    resolveGroupTemplateDirtyNames,
    ensureGroupTemplateSnapshot,
    applyStructuredDataSource,
    clearFieldValues,
    handleFieldsChange,
    enterFillDisplayMode,
    setSearchFillPreset,
    setShowSearchFill,
    bumpSearchFillSession,
  } = deps;

  const hasActiveTemplateScope = Boolean(activeTemplateId);
  const hasActiveGroupScope = Boolean(activeGroupId && activeGroupTemplates.length > 0);
  const hasUnsavedTemplateDraft = Boolean(!activeTemplateId && !activeGroupId && fields.length > 0);
  const canTriggerFillLink = Boolean(
    verifiedUser && (hasActiveTemplateScope || hasActiveGroupScope || hasUnsavedTemplateDraft),
  );

  const templateFillLinks = useFillLinks({
    verifiedUser,
    enabled: managerOpen,
    scopeType: 'template',
    scopeId: activeTemplateId,
    scopeName: activeTemplateName,
    fields,
    checkboxRules,
    setBannerNotice,
  });
  const groupFillLinks = useFillLinks({
    verifiedUser,
    enabled: managerOpen && Boolean(activeGroupId),
    scopeType: 'group',
    scopeId: activeGroupId,
    scopeName: activeGroupName,
    fields,
    checkboxRules,
    setBannerNotice,
  });
  const {
    activeLink: activeTemplateLink,
    responses: templateResponses,
    loading: templateLoadingLink,
    publishing: templatePublishing,
    closing: templateClosing,
    responsesLoading: templateResponsesLoading,
    error: templateError,
    clear: clearTemplateFillLinks,
    publish: publishTemplateLink,
    closeLink: closeTemplateLink,
    reopenLink: reopenTemplateLink,
    refreshResponses: refreshTemplateLinkResponses,
    searchResponses: searchTemplateLinkResponses,
    loadAllResponses: loadAllTemplateResponses,
  } = templateFillLinks;
  const {
    activeLink: activeGroupLink,
    responses: groupResponses,
    loading: groupLoadingLink,
    publishing: groupPublishing,
    closing: groupClosing,
    responsesLoading: groupResponsesLoading,
    error: groupError,
    clear: clearGroupFillLinks,
    publish: publishGroupLink,
    closeLink: closeGroupLink,
    reopenLink: reopenGroupLink,
    refreshResponses: refreshGroupLinkResponses,
    searchResponses: searchGroupLinkResponses,
    loadAllResponses: loadAllGroupResponses,
  } = groupFillLinks;

  const [groupSourceQuestions, setGroupSourceQuestions] = useState<FillLinkQuestion[]>([]);
  const [groupBuilderLoading, setGroupBuilderLoading] = useState(false);

  const templateSourceQuestions = useMemo(
    () => buildFillLinkQuestionsFromFields(fields, checkboxRules),
    [checkboxRules, fields],
  );
  const templateHasSigningAnchors = useMemo(
    () => buildSigningAnchorsFromFields(fields).length > 0,
    [fields],
  );
  const templateHasPrefilledValues = useMemo(
    () => hasMeaningfulFillValues(fields),
    [fields],
  );

  const fillLinkSchemaDirty = useMemo(() => {
    if (!activeTemplateId || savedFillLinkPublishFingerprint === null) {
      return false;
    }
    return buildFillLinkPublishFingerprint(fields, checkboxRules) !== savedFillLinkPublishFingerprint;
  }, [activeTemplateId, checkboxRules, fields, savedFillLinkPublishFingerprint]);

  const serializeCurrentFillLinkFields = useCallback(
    (): FillLinkTemplateFieldPayload[] => buildFillLinkTemplateFields(fields),
    [fields],
  );

  useEffect(() => {
    if (!managerOpen) {
      clearTemplateFillLinks();
      return;
    }
    if (!verifiedUser || (!activeTemplateId && !hasActiveGroupScope)) {
      clearTemplateFillLinks();
      setManagerOpen(false);
      return;
    }
    if (!activeTemplateId) {
      clearTemplateFillLinks();
    }
  }, [
    activeTemplateId,
    clearTemplateFillLinks,
    hasActiveGroupScope,
    managerOpen,
    setManagerOpen,
    verifiedUser,
  ]);

  useEffect(() => {
    if (!managerOpen) {
      clearGroupFillLinks();
      return;
    }
    if (!verifiedUser || !activeGroupId) {
      clearGroupFillLinks();
    }
  }, [
    activeGroupId,
    clearGroupFillLinks,
    managerOpen,
    verifiedUser,
  ]);

  useEffect(() => {
    if (!managerOpen || !hasActiveGroupScope || !activeGroupId) {
      setGroupSourceQuestions([]);
      setGroupBuilderLoading(false);
      return;
    }
    let cancelled = false;
    setGroupBuilderLoading(true);
    void (async () => {
      try {
        const questionSets: FillLinkQuestion[][] = [];
        for (const template of activeGroupTemplates) {
          if (template.id === activeTemplateId) {
            questionSets.push(buildFillLinkQuestionsFromFields(fields, checkboxRules));
            continue;
          }
          const snapshot = await ensureGroupTemplateSnapshot(template.id, template.name);
          questionSets.push(buildFillLinkQuestionsFromFields(snapshot.fields, snapshot.checkboxRules));
        }
        if (cancelled) {
          return;
        }
        setGroupSourceQuestions(mergeFillLinkQuestionSets(questionSets));
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error
            ? error.message
            : 'Failed to prepare merged group web-form fields.';
          setBannerNotice({ tone: 'error', message });
          setGroupSourceQuestions([]);
        }
      } finally {
        if (!cancelled) {
          setGroupBuilderLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeGroupId,
    activeGroupTemplates,
    activeTemplateId,
    checkboxRules,
    ensureGroupTemplateSnapshot,
    fields,
    hasActiveGroupScope,
    managerOpen,
    setBannerNotice,
  ]);

  const guardDirtyTemplateSchema = useCallback(() => {
    if (!fillLinkSchemaDirty) return false;
    setBannerNotice({
      tone: 'error',
      message: 'Save this template before publishing or refreshing Fill By Link.',
      autoDismissMs: 7000,
    });
    return true;
  }, [fillLinkSchemaDirty, setBannerNotice]);

  const guardDirtyGroupSchema = useCallback(() => {
    const dirtyTemplateNames = resolveGroupTemplateDirtyNames();
    if (dirtyTemplateNames.length === 0) return false;
    setBannerNotice({
      tone: 'error',
      message: 'Save every edited template in this group before publishing or refreshing Group Fill By Link.',
      autoDismissMs: 7000,
    });
    return true;
  }, [resolveGroupTemplateDirtyNames, setBannerNotice]);

  const buildGroupFillLinkTemplateSources = useCallback(async (): Promise<FillLinkGroupTemplatePayload[]> => {
    if (!activeGroupId || activeGroupTemplates.length === 0) {
      throw new Error('Open a group before publishing Group Fill By Link.');
    }
    const groupTemplateSources: FillLinkGroupTemplatePayload[] = [];
    for (const template of activeGroupTemplates) {
      if (template.id === activeTemplateId) {
        groupTemplateSources.push({
          templateId: template.id,
          templateName: template.name,
          fields: serializeCurrentFillLinkFields(),
          checkboxRules: checkboxRules as Array<Record<string, unknown>>,
        });
        continue;
      }
      const snapshot = await ensureGroupTemplateSnapshot(template.id, template.name);
      groupTemplateSources.push({
        templateId: template.id,
        templateName: template.name,
        fields: buildFillLinkTemplateFields(snapshot.fields),
        checkboxRules: snapshot.checkboxRules as Array<Record<string, unknown>>,
      });
    }
    return groupTemplateSources;
  }, [
    activeGroupId,
    activeGroupTemplates,
    activeTemplateId,
    checkboxRules,
    ensureGroupTemplateSnapshot,
    serializeCurrentFillLinkFields,
  ]);

  const handleOpenFillLinkManager = useCallback(() => {
    if (!verifiedUser) {
      setBannerNotice({ tone: 'error', message: 'Sign in to use Fill By Link.' });
      return;
    }
    if (hasUnsavedTemplateDraft) {
      setBannerNotice({
        tone: 'error',
        message: 'Save form first to share link.',
        autoDismissMs: 7000,
      });
      return;
    }
    if (!hasActiveTemplateScope && !hasActiveGroupScope) {
      setBannerNotice({ tone: 'error', message: 'Load a saved form or open a group before publishing Fill By Link.' });
      return;
    }
    setManagerOpen(true);
  }, [
    hasActiveGroupScope,
    hasActiveTemplateScope,
    hasUnsavedTemplateDraft,
    setBannerNotice,
    setManagerOpen,
    verifiedUser,
  ]);

  const handlePublishTemplate = useCallback(async (options?: {
    title?: string;
    requireAllFields?: boolean;
    allowRespondentPdfDownload?: boolean;
    allowRespondentEditablePdfDownload?: boolean;
    webFormConfig?: FillLinkWebFormConfig;
    signingConfig?: FillLinkSigningConfig;
  }) => {
    if (!activeTemplateId) return;
    if (guardDirtyTemplateSchema()) return;
    try {
      await publishTemplateLink({
        scopeType: 'template',
        templateId: activeTemplateId,
        templateName: activeTemplateName,
        title: options?.title || activeTemplateName || 'Fill By Link',
        requireAllFields: Boolean(options?.requireAllFields),
        allowRespondentPdfDownload: Boolean(options?.allowRespondentPdfDownload),
        allowRespondentEditablePdfDownload: Boolean(options?.allowRespondentEditablePdfDownload),
        webFormConfig: options?.webFormConfig,
        signingConfig: options?.signingConfig,
        fields: serializeCurrentFillLinkFields(),
        checkboxRules: checkboxRules as Array<Record<string, unknown>>,
        textTransformRules: textTransformRules as TextTransformRule[],
      });
      setBannerNotice({
        tone: 'success',
        message: 'Fill By Link is live. Share the public link with respondents.',
        autoDismissMs: 6000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish Fill By Link.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [
    activeTemplateId,
    activeTemplateName,
    checkboxRules,
    guardDirtyTemplateSchema,
    publishTemplateLink,
    serializeCurrentFillLinkFields,
    setBannerNotice,
    textTransformRules,
  ]);

  const handlePublishGroup = useCallback(async (options?: {
    title?: string;
    requireAllFields?: boolean;
    webFormConfig?: FillLinkWebFormConfig;
    signingConfig?: FillLinkSigningConfig;
  }) => {
    if (!activeGroupId) return;
    if (guardDirtyGroupSchema()) return;
    try {
      const groupTemplates = await buildGroupFillLinkTemplateSources();
      await publishGroupLink({
        scopeType: 'group',
        groupId: activeGroupId,
        groupName: activeGroupName,
        title: options?.title || activeGroupName || 'Group Fill By Link',
        requireAllFields: Boolean(options?.requireAllFields),
        webFormConfig: options?.webFormConfig,
        signingConfig: options?.signingConfig,
        fields: [],
        groupTemplates,
      });
      setBannerNotice({
        tone: 'success',
        message: 'Group Fill By Link is live. Share the public link with respondents.',
        autoDismissMs: 6000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish Group Fill By Link.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [
    activeGroupId,
    activeGroupName,
    buildGroupFillLinkTemplateSources,
    guardDirtyGroupSchema,
    publishGroupLink,
    setBannerNotice,
  ]);

  const handleCloseTemplate = useCallback(async () => {
    const linkId = activeTemplateLink?.id;
    if (!linkId) return;
    try {
      await closeTemplateLink(linkId);
      setBannerNotice({ tone: 'info', message: 'Fill By Link closed.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to close Fill By Link.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [activeTemplateLink, closeTemplateLink, setBannerNotice]);

  const handleReopenTemplate = useCallback(async (options?: {
    title?: string;
    requireAllFields?: boolean;
    allowRespondentPdfDownload?: boolean;
    allowRespondentEditablePdfDownload?: boolean;
    webFormConfig?: FillLinkWebFormConfig;
    signingConfig?: FillLinkSigningConfig;
  }) => {
    const activeLink = activeTemplateLink;
    const linkId = activeLink?.id;
    if (!activeLink || !linkId) return;
    if (guardDirtyTemplateSchema()) return;
    try {
      await reopenTemplateLink(linkId, {
        title: options?.title || activeTemplateName || activeLink.title || undefined,
        requireAllFields: options?.requireAllFields ?? activeLink.requireAllFields,
        allowRespondentPdfDownload:
          options?.allowRespondentPdfDownload
          ?? fillLinkRespondentPdfDownloadEnabled(activeLink),
        allowRespondentEditablePdfDownload:
          options?.allowRespondentEditablePdfDownload
          ?? Boolean(activeLink?.respondentPdfEditableEnabled),
        webFormConfig: options?.webFormConfig,
        signingConfig: options?.signingConfig,
        fields: serializeCurrentFillLinkFields(),
        checkboxRules: checkboxRules as Array<Record<string, unknown>>,
        textTransformRules: textTransformRules as TextTransformRule[],
      });
      setBannerNotice({ tone: 'success', message: 'Fill By Link reopened.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reopen Fill By Link.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [
    activeTemplateLink,
    activeTemplateName,
    checkboxRules,
    guardDirtyTemplateSchema,
    reopenTemplateLink,
    serializeCurrentFillLinkFields,
    setBannerNotice,
    textTransformRules,
  ]);

  const handleCloseGroup = useCallback(async () => {
    const linkId = activeGroupLink?.id;
    if (!linkId) return;
    try {
      await closeGroupLink(linkId);
      setBannerNotice({ tone: 'info', message: 'Group Fill By Link closed.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to close Group Fill By Link.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [activeGroupLink, closeGroupLink, setBannerNotice]);

  const handleReopenGroup = useCallback(async (options?: {
    title?: string;
    requireAllFields?: boolean;
    webFormConfig?: FillLinkWebFormConfig;
    signingConfig?: FillLinkSigningConfig;
  }) => {
    const activeLink = activeGroupLink;
    const linkId = activeLink?.id;
    if (!activeLink || !linkId || !activeGroupId) return;
    if (guardDirtyGroupSchema()) return;
    try {
      const groupTemplates = await buildGroupFillLinkTemplateSources();
      await reopenGroupLink(linkId, {
        title: options?.title || activeGroupName || activeLink.title || undefined,
        groupName: activeGroupName || undefined,
        requireAllFields: options?.requireAllFields ?? activeLink.requireAllFields,
        webFormConfig: options?.webFormConfig,
        signingConfig: options?.signingConfig,
        groupTemplates,
      });
      setBannerNotice({ tone: 'success', message: 'Group Fill By Link reopened.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reopen Group Fill By Link.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [
    activeGroupId,
    activeGroupLink,
    activeGroupName,
    buildGroupFillLinkTemplateSources,
    guardDirtyGroupSchema,
    reopenGroupLink,
    setBannerNotice,
  ]);

  const handleRefreshTemplateResponses = useCallback(async (search?: string) => {
    const linkId = activeTemplateLink?.id;
    if (!linkId) return;
    try {
      await refreshTemplateLinkResponses(linkId, {
        search: search?.trim() || undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh Fill By Link responses.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [activeTemplateLink, refreshTemplateLinkResponses, setBannerNotice]);

  const handleRefreshGroupResponses = useCallback(async (search?: string) => {
    const linkId = activeGroupLink?.id;
    if (!linkId) return;
    try {
      await refreshGroupLinkResponses(linkId, {
        search: search?.trim() || undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refresh Group Fill By Link responses.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [activeGroupLink, refreshGroupLinkResponses, setBannerNotice]);

  const handleSearchTemplateResponses = useCallback(async (search: string) => {
    try {
      await searchTemplateLinkResponses(search);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search Fill By Link responses.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [searchTemplateLinkResponses, setBannerNotice]);

  const handleSearchGroupResponses = useCallback(async (search: string) => {
    try {
      await searchGroupLinkResponses(search);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search Group Fill By Link responses.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [searchGroupLinkResponses, setBannerNotice]);

  const applyFillLinkResponsesAsDataSource = useCallback((responses: FillLinkResponse[], link: SearchFillLink) => {
    const responseRows = buildFillLinkResponseRows(responses);
    const responseColumns = Array.from(new Set(responseRows.flatMap((row) => Object.keys(row))));
    const sourceLabel = link?.scopeType === 'group'
      ? `Group Fill By Link respondents: ${link.groupName || activeGroupName || 'saved group'}`
      : `Fill By Link respondents: ${link?.templateName || activeTemplateName || 'saved template'}`;
    applyStructuredDataSource({
      kind: 'respondent',
      label: sourceLabel,
      rows: responseRows,
      columns: responseColumns,
      identifierKey: FILL_LINK_RESPONDENT_LABEL_KEY,
    });
  }, [activeGroupName, activeTemplateName, applyStructuredDataSource]);

  const resolveResponsesForSearchFill = useCallback(async (
    link: Pick<FillLinkSummary, 'id' | 'responseCount'> | null,
    existingResponses: FillLinkResponse[],
    loadAllResponses: (limitHint?: number) => Promise<FillLinkResponse[]>,
  ) => {
    if (!link?.id) {
      return existingResponses;
    }
    const requestedLimit = Math.max(
      existingResponses.length,
      link.responseCount ?? existingResponses.length,
      1,
    );
    const responseLimit = profileLimits.fillLinkResponsesMonthlyMax;
    return loadAllResponses(Math.min(requestedLimit, responseLimit));
  }, [profileLimits.fillLinkResponsesMonthlyMax]);

  const openResponsesInSearchFill = useCallback(async (
    response: FillLinkResponse | null,
    link: SearchFillLink,
    existingResponses: FillLinkResponse[],
    loadAllResponses: (limitHint?: number) => Promise<FillLinkResponse[]>,
  ) => {
    try {
      const searchFillResponses = await resolveResponsesForSearchFill(link, existingResponses, loadAllResponses);
      clearFieldValues();
      applyFillLinkResponsesAsDataSource(searchFillResponses, link);
      setSearchFillPreset(response ? {
        query: response.id,
        searchKey: FILL_LINK_RESPONSE_ID_KEY,
        searchMode: 'equals',
        autoRun: true,
        autoFillOnSearch: true,
        token: Date.now(),
      } : null);
      setManagerOpen(false);
      bumpSearchFillSession();
      setShowSearchFill(true);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to load Fill By Link respondents for Search & Fill.';
      setBannerNotice({ tone: 'error', message });
    }
  }, [
    applyFillLinkResponsesAsDataSource,
    bumpSearchFillSession,
    clearFieldValues,
    resolveResponsesForSearchFill,
    setBannerNotice,
    setManagerOpen,
    setSearchFillPreset,
    setShowSearchFill,
  ]);

  // Apply a single Fill By Link response directly to the PDF fields without
  // ever opening the Search & Fill popup. The popup path (``openResponsesIn
  // SearchFill``) was fragile: it loaded every response, set a preset, and
  // hoped the auto-run search hit the right row. Any failure along that
  // chain surfaced as "popup opens but doesn't fill" — the exact bug users
  // reported. Direct apply is deterministic: we have the row, we have the
  // fields, we just merge.
  //
  // ``clearFirst=true`` — wipe every field value first so the fill fully
  // replaces whatever was there. Equivalent to the old default.
  // ``clearFirst=false`` — merge: only empty fields get populated from the
  // response, but collisions (non-empty fields that the response has data
  // for) are overwritten. Useful when the user has already typed values
  // they want to keep.
  const applyResponseToFields = useCallback(
    (response: FillLinkResponse, { clearFirst }: { clearFirst: boolean }) => {
      const [row] = buildFillLinkResponseRows([response]);
      if (!row) {
        setBannerNotice({ tone: 'error', message: 'Response has no answers to apply.' });
        return;
      }
      let baseFields = fields;
      if (clearFirst) {
        // Zero out existing values but keep the field definitions so
        // ``applySearchFillRowToFieldsWithStats`` has something to fill.
        baseFields = fields.map((field) => ({
          ...field,
          value: field.type === 'checkbox' ? false : undefined,
        }));
      }
      const result = applySearchFillRowToFieldsWithStats({
        row,
        fields: baseFields,
        checkboxRules,
        textTransformRules,
        dataSourceKind: 'respondent',
      });
      let appliedFieldValues = false;
      if (clearFirst) {
        // Always commit the cleared baseline even when the response had
        // zero matches — the user asked for a clean slate.
        handleFieldsChange(result.fields);
        appliedFieldValues = true;
      } else if (result.matchedFieldCount === 0) {
        setBannerNotice({
          tone: 'info',
          message: 'Response had no values that matched the template fields.',
          autoDismissMs: 4000,
        });
      } else {
        handleFieldsChange(result.fields);
        appliedFieldValues = true;
      }
      setManagerOpen(false);
      if (appliedFieldValues) {
        // Flip the workspace into fill-display mode so the user actually
        // sees the values they just applied instead of a names-only list.
        // Skipping this was the root cause of "I thought the fill didn't
        // work" on webform response apply.
        enterFillDisplayMode();
      }
    },
    [
      checkboxRules,
      enterFillDisplayMode,
      fields,
      handleFieldsChange,
      setBannerNotice,
      setManagerOpen,
      textTransformRules,
    ],
  );

  const handleApplyTemplateResponse = useCallback(
    async (response: FillLinkResponse) => {
      applyResponseToFields(response, { clearFirst: false });
    },
    [applyResponseToFields],
  );

  const handleApplyTemplateResponseWithClear = useCallback(
    async (response: FillLinkResponse) => {
      applyResponseToFields(response, { clearFirst: true });
    },
    [applyResponseToFields],
  );

  const handleUseTemplateResponsesAsSearchFill = useCallback(async () => {
    if (!templateResponses.length) return;
    await openResponsesInSearchFill(null, activeTemplateLink, templateResponses, loadAllTemplateResponses);
  }, [activeTemplateLink, loadAllTemplateResponses, openResponsesInSearchFill, templateResponses]);

  const handleApplyGroupResponse = useCallback(
    async (response: FillLinkResponse) => {
      applyResponseToFields(response, { clearFirst: false });
    },
    [applyResponseToFields],
  );

  const handleApplyGroupResponseWithClear = useCallback(
    async (response: FillLinkResponse) => {
      applyResponseToFields(response, { clearFirst: true });
    },
    [applyResponseToFields],
  );

  const handleUseGroupResponsesAsSearchFill = useCallback(async () => {
    if (!groupResponses.length) return;
    await openResponsesInSearchFill(null, activeGroupLink, groupResponses, loadAllGroupResponses);
  }, [activeGroupLink, groupResponses, loadAllGroupResponses, openResponsesInSearchFill]);

  const clearAllFillLinks = useCallback(() => {
    clearTemplateFillLinks();
    clearGroupFillLinks();
  }, [clearGroupFillLinks, clearTemplateFillLinks]);

  const dialogProps: FillLinkManagerDialogProps = useMemo(() => ({
    open: managerOpen,
    onClose: () => setManagerOpen(false),
    templateName: activeTemplateName,
    hasActiveTemplate: hasActiveTemplateScope,
    templateHasSigningAnchors,
    templateHasPrefilledValues,
    groupName: activeGroupName,
    hasActiveGroup: hasActiveGroupScope,
    templateSourceQuestions,
    templateBuilderLoading: false,
    groupSourceQuestions,
    groupBuilderLoading,
    templateLink: activeTemplateLink,
    templateResponses,
    templateLoadingLink,
    templatePublishing,
    templateClosing,
    templateLoadingResponses: templateResponsesLoading,
    templateError,
    onPublishTemplate: handlePublishTemplate,
    onRefreshTemplate: handleRefreshTemplateResponses,
    onSearchTemplateResponses: handleSearchTemplateResponses,
    onCloseTemplateLink: activeTemplateLink?.status === 'active' ? handleCloseTemplate : handleReopenTemplate,
    onApplyTemplateResponse: handleApplyTemplateResponse,
    onApplyTemplateResponseWithClear: handleApplyTemplateResponseWithClear,
    onUseTemplateResponsesAsSearchFill: handleUseTemplateResponsesAsSearchFill,
    groupLink: activeGroupLink,
    groupResponses,
    groupLoadingLink,
    groupPublishing,
    groupClosing,
    groupLoadingResponses: groupResponsesLoading,
    groupError,
    onPublishGroup: handlePublishGroup,
    onRefreshGroup: handleRefreshGroupResponses,
    onSearchGroupResponses: handleSearchGroupResponses,
    onCloseGroupLink: activeGroupLink?.status === 'active' ? handleCloseGroup : handleReopenGroup,
    onApplyGroupResponse: handleApplyGroupResponse,
    onApplyGroupResponseWithClear: handleApplyGroupResponseWithClear,
    onUseGroupResponsesAsSearchFill: handleUseGroupResponsesAsSearchFill,
  }), [
    activeGroupLink,
    activeGroupName,
    activeTemplateLink,
    activeTemplateName,
    groupClosing,
    groupError,
    groupLoadingLink,
    groupPublishing,
    groupResponses,
    groupResponsesLoading,
    groupSourceQuestions,
    groupBuilderLoading,
    handleApplyGroupResponse,
    handleApplyGroupResponseWithClear,
    handleApplyTemplateResponse,
    handleApplyTemplateResponseWithClear,
    handleCloseGroup,
    handleCloseTemplate,
    handlePublishGroup,
    handlePublishTemplate,
    handleRefreshGroupResponses,
    handleRefreshTemplateResponses,
    handleReopenGroup,
    handleReopenTemplate,
    handleSearchGroupResponses,
    handleSearchTemplateResponses,
    handleUseGroupResponsesAsSearchFill,
    handleUseTemplateResponsesAsSearchFill,
    hasActiveGroupScope,
    hasActiveTemplateScope,
    managerOpen,
    setManagerOpen,
    templateSourceQuestions,
    templateClosing,
    templateError,
    templateLoadingLink,
    templatePublishing,
    templateResponses,
    templateResponsesLoading,
    templateHasSigningAnchors,
    templateHasPrefilledValues,
  ]);

  return {
    canTriggerFillLink,
    handleOpenFillLinkManager,
    clearAllFillLinks,
    dialogProps,
  };
}
