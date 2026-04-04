import { useEffect, useMemo, useState } from 'react';
import type {
  CreateSigningRequestPayload,
  SigningCategoryOption,
  SigningOptions,
  SigningRequestSummary,
} from '../../services/api';
import type { ReviewedFillContext } from '../../utils/signing';
import { signerColorForOrder } from '../../utils/signing';
import {
  mergeSigningRecipients,
  normalizeSigningRecipient,
  parseSigningRecipientsFromFile,
  parseSigningRecipientsFromText,
  type SigningRecipientInput,
} from '../../utils/signingRecipients';
import type { WorkspaceSigningDraftPayload } from '../../hooks/useWorkspaceSigning';
import { Dialog } from '../ui/Dialog';
import { Alert } from '../ui/Alert';
import { SigningResponsesPanel } from './SigningResponsesPanel';
import { openUsageDocsWindow, USAGE_DOCS_ROUTES } from '../../utils/usageDocs';
import '../../styles/ui-buttons.css';
import './SignatureRequestDialog.css';

type SignatureRequestDialogProps = {
  open: boolean;
  onClose: () => void;
  hasDocument: boolean;
  sourceDocumentName: string | null;
  sourceTemplateId?: string | null;
  sourceTemplateName?: string | null;
  options: SigningOptions | null;
  optionsLoading?: boolean;
  responses?: SigningRequestSummary[];
  responsesLoading?: boolean;
  saving?: boolean;
  sending?: boolean;
  revokingRequestId?: string | null;
  reissuingRequestId?: string | null;
  error?: string | null;
  notice?: string | null;
  createdRequest?: SigningRequestSummary | null;
  createdRequests?: SigningRequestSummary[];
  sendDisabledReason?: string | null;
  hasMeaningfulFillValues?: boolean;
  fillAndSignContext?: ReviewedFillContext | null;
  defaultAnchors?: WorkspaceSigningDraftPayload['anchors'];
  onCreateDraft?: (payload: CreateSigningRequestPayload) => Promise<void> | void;
  onCreateDrafts: (payload: WorkspaceSigningDraftPayload) => Promise<void> | void;
  onSendRequest?: (options?: { ownerReviewConfirmed?: boolean }) => Promise<void> | void;
  onSendRequests?: (options?: { ownerReviewConfirmed?: boolean }) => Promise<void> | void;
  onRevokeRequest?: (requestId: string) => Promise<void> | void;
  onReissueRequest?: (requestId: string) => Promise<void> | void;
  onRefreshResponses?: () => Promise<void> | void;
};

type DialogTab = 'prepare' | 'responses';

const DEFAULT_MODE: WorkspaceSigningDraftPayload['mode'] = 'sign';
const DEFAULT_SIGNATURE_MODE: WorkspaceSigningDraftPayload['signatureMode'] = 'business';

function firstAllowedCategory(options: SigningOptions | null): string {
  const allowed = options?.categories?.find((entry) => !entry.blocked);
  return allowed?.key || 'ordinary_business_form';
}

function buildDefaultTitle(sourceDocumentName: string | null, mode: WorkspaceSigningDraftPayload['mode']): string {
  const base = sourceDocumentName?.trim() || 'Untitled PDF';
  if (mode === 'fill_and_sign') {
    return `${base} Fill And Sign`;
  }
  return `${base} Signature Request`;
}

function describeMode(mode: WorkspaceSigningDraftPayload['mode'], fillAndSignContext: ReviewedFillContext | null): string {
  return mode === 'fill_and_sign'
    ? fillAndSignContext?.sourceType === 'fill_link_response'
      ? 'DullyPDF will freeze the reviewed Fill By Link response exactly as it appears in the workspace, then hand that immutable PDF to each signer.'
      : 'DullyPDF will freeze the current reviewed workspace values into an immutable PDF, then hand that exact record to each signer.'
    : 'DullyPDF will freeze the current PDF state into an immutable source snapshot before signature collection begins.';
}

function describeFillAndSignSource(fillAndSignContext: ReviewedFillContext | null): string {
  if (!fillAndSignContext) {
    return 'Current workspace values';
  }
  if (fillAndSignContext.sourceType === 'fill_link_response') {
    return fillAndSignContext.sourceRecordLabel
      ? `Fill By Link response: ${fillAndSignContext.sourceRecordLabel}`
      : 'Stored Fill By Link response';
  }
  return fillAndSignContext.sourceLabel || 'Current workspace values';
}

function resolveBatchStatus(createdRequests: SigningRequestSummary[]): string {
  if (!createdRequests.length) return 'No batch yet';
  const completed = createdRequests.filter((entry) => entry.status === 'completed').length;
  const sent = createdRequests.filter((entry) => entry.status === 'sent').length;
  const drafts = createdRequests.filter((entry) => entry.status === 'draft').length;
  if (completed && !sent && !drafts) return `All ${completed} signed`;
  if (sent && !drafts) return `${sent} waiting for signer`;
  if (drafts && !sent) return `${drafts} draft${drafts === 1 ? '' : 's'} saved`;
  return `${sent} waiting, ${completed} signed, ${drafts} drafts`;
}

function joinRejectedRecipients(rejected: string[]): string | null {
  if (!rejected.length) return null;
  return `These rows could not be read: ${rejected.join(' | ')}`;
}

function resolveCreateBlockedReason(params: {
  hasDocument: boolean;
  sourceDocumentName: string | null;
  options: SigningOptions | null;
  optionsLoading: boolean;
  plannedRecipientCount: number;
  hasPendingRecipientDraft: boolean;
  documentCategory: string;
  blockedCategory: boolean;
  blockedCategoryReason: string | null;
  esignEligibilityConfirmed: boolean;
  consumerDisclosureError: string | null;
  fillAndSignNeedsValues: boolean;
}): string | null {
  const {
    hasDocument,
    sourceDocumentName,
    options,
    optionsLoading,
    plannedRecipientCount,
    hasPendingRecipientDraft,
    documentCategory,
    blockedCategory,
    blockedCategoryReason,
    esignEligibilityConfirmed,
    consumerDisclosureError,
    fillAndSignNeedsValues,
  } = params;
  if (!hasDocument) return 'Load a PDF in the workspace before starting a signing request.';
  if (optionsLoading || !options) return 'Signing options are still loading. Try again in a moment.';
  if (!String(sourceDocumentName || '').trim()) return 'Reload the active PDF before saving a signing draft.';
  if (!plannedRecipientCount) {
    return hasPendingRecipientDraft
      ? 'Enter a valid signer email before saving a signing draft.'
      : 'Add at least one recipient before saving a signing draft.';
  }
  if (!String(documentCategory || '').trim()) return 'Choose a document category before saving a signing draft.';
  if (blockedCategory) return blockedCategoryReason || 'This document category is blocked for DullyPDF signing.';
  if (!esignEligibilityConfirmed) return 'Confirm the U.S. e-sign eligibility attestation before saving a signing draft.';
  if (consumerDisclosureError) return consumerDisclosureError;
  if (fillAndSignNeedsValues) {
    return 'Fill and Sign needs reviewed field values in the workspace. Fill the PDF first, then create the signing draft.';
  }
  return null;
}

function resolveSendBlockedReason(options: {
  sendDisabledReason: string | null;
  batchNeedsOwnerReview: boolean;
  ownerReviewConfirmed: boolean;
  hasSendHandler: boolean;
}): string | null {
  const {
    sendDisabledReason,
    batchNeedsOwnerReview,
    ownerReviewConfirmed,
    hasSendHandler,
  } = options;
  if (!hasSendHandler) return 'Sending is unavailable right now. Close the dialog and try again.';
  if (sendDisabledReason) return sendDisabledReason;
  if (batchNeedsOwnerReview && !ownerReviewConfirmed) {
    return 'Review the filled PDF and confirm that DullyPDF should freeze this exact version before sending.';
  }
  return null;
}

export function SignatureRequestDialog({
  open,
  onClose,
  hasDocument,
  sourceDocumentName,
  sourceTemplateId = null,
  sourceTemplateName = null,
  options,
  optionsLoading = false,
  responses = [],
  responsesLoading = false,
  saving = false,
  sending = false,
  revokingRequestId = null,
  reissuingRequestId = null,
  error = null,
  notice = null,
  createdRequest = null,
  createdRequests = [],
  sendDisabledReason = null,
  hasMeaningfulFillValues = false,
  fillAndSignContext = null,
  defaultAnchors = [],
  onCreateDraft,
  onCreateDrafts,
  onSendRequest,
  onSendRequests,
  onRevokeRequest,
  onReissueRequest,
  onRefreshResponses,
}: SignatureRequestDialogProps) {
  const stableCreatedRequests = createdRequests;
  const [activeTab, setActiveTab] = useState<DialogTab>('prepare');
  const [mode, setMode] = useState<WorkspaceSigningDraftPayload['mode']>(DEFAULT_MODE);
  const [signatureMode, setSignatureMode] = useState<WorkspaceSigningDraftPayload['signatureMode']>(DEFAULT_SIGNATURE_MODE);
  const [documentCategory, setDocumentCategory] = useState<string>(firstAllowedCategory(options));
  const [esignEligibilityConfirmed, setEsignEligibilityConfirmed] = useState(false);
  const [companyBindingEnabled, setCompanyBindingEnabled] = useState(false);
  const [manualFallbackEnabled, setManualFallbackEnabled] = useState(true);
  const [consumerPaperCopyProcedure, setConsumerPaperCopyProcedure] = useState('');
  const [consumerPaperCopyFeeDescription, setConsumerPaperCopyFeeDescription] = useState('');
  const [consumerWithdrawalProcedure, setConsumerWithdrawalProcedure] = useState('');
  const [consumerWithdrawalConsequences, setConsumerWithdrawalConsequences] = useState('');
  const [consumerContactUpdateProcedure, setConsumerContactUpdateProcedure] = useState('');
  const [consumerConsentScopeDescription, setConsumerConsentScopeDescription] = useState('');
  const [draftSignerName, setDraftSignerName] = useState('');
  const [draftSignerEmail, setDraftSignerEmail] = useState('');
  const [recipientImportText, setRecipientImportText] = useState('');
  const [recipientImportError, setRecipientImportError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<SigningRecipientInput[]>([]);
  const [signingMode, setSigningMode] = useState<'separate' | 'parallel' | 'sequential'>('separate');
  const [anchorAssignments, setAnchorAssignments] = useState<Map<string, number>>(new Map());
  const [ownerReviewConfirmed, setOwnerReviewConfirmed] = useState(false);
  const [actionValidationMessage, setActionValidationMessage] = useState<string | null>(null);

  function clearActionValidationMessage() {
    setActionValidationMessage(null);
  }

  useEffect(() => {
    if (signingMode === 'separate') {
      setAnchorAssignments(new Map());
      return;
    }
    const validOrders = new Set(recipients.map((_, i) => i + 1));
    setAnchorAssignments((prev) => {
      const next = new Map<string, number>();
      for (const [key, order] of prev) {
        if (validOrders.has(order)) next.set(key, order);
      }
      return next.size !== prev.size ? next : prev;
    });
  }, [recipients, signingMode]);

  function moveRecipient(index: number, direction: 'up' | 'down') {
    setRecipients((current) => {
      const next = [...current];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return current;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  }

  useEffect(() => {
    if (!open) return;
    setDocumentCategory(firstAllowedCategory(options));
  }, [open, options]);

  useEffect(() => {
    if (!open) return;
    setActiveTab('prepare');
    setMode(DEFAULT_MODE);
    setSignatureMode(DEFAULT_SIGNATURE_MODE);
    setEsignEligibilityConfirmed(false);
    setCompanyBindingEnabled(false);
    setManualFallbackEnabled(true);
    setConsumerPaperCopyProcedure('');
    setConsumerPaperCopyFeeDescription('');
    setConsumerWithdrawalProcedure('');
    setConsumerWithdrawalConsequences('');
    setConsumerContactUpdateProcedure('');
    setConsumerConsentScopeDescription('');
    setDraftSignerName('');
    setDraftSignerEmail('');
    setRecipientImportText('');
    setRecipientImportError(null);
    setRecipients([]);
    setOwnerReviewConfirmed(false);
    setActionValidationMessage(null);
  }, [open, sourceDocumentName]);

  const effectiveCreatedRequests = useMemo(
    () => (stableCreatedRequests.length
      ? stableCreatedRequests
      : createdRequest
        ? [createdRequest]
        : []),
    [createdRequest, stableCreatedRequests],
  );

  const createdRequestResetKey = useMemo(
    () => effectiveCreatedRequests.map((entry) => `${entry.id}:${entry.status}:${entry.sourceVersion || ''}`).join('|'),
    [effectiveCreatedRequests],
  );

  useEffect(() => {
    if (!open) return;
    setOwnerReviewConfirmed(false);
    setActionValidationMessage(null);
  }, [createdRequestResetKey, open]);

  const pendingManualRecipient = useMemo(
    () => normalizeSigningRecipient(draftSignerName, draftSignerEmail, 'manual'),
    [draftSignerEmail, draftSignerName],
  );
  const selectedCategory = useMemo(
    () => options?.categories?.find((entry) => entry.key === documentCategory) || null,
    [documentCategory, options],
  );
  const blockedCategory = Boolean(selectedCategory?.blocked);
  const consumerDisclosureError = useMemo(() => {
    if (signatureMode !== 'consumer') return null;
    if (!consumerPaperCopyProcedure.trim()) return 'Consumer signing requires a paper-copy or offline procedure.';
    if (!consumerPaperCopyFeeDescription.trim()) return 'Consumer signing requires a paper-copy fee disclosure.';
    if (!consumerWithdrawalProcedure.trim()) return 'Consumer signing requires a withdrawal procedure.';
    if (!consumerWithdrawalConsequences.trim()) return 'Consumer signing requires withdrawal consequences.';
    if (!consumerContactUpdateProcedure.trim()) return 'Consumer signing requires contact-update instructions.';
    return null;
  }, [
    consumerContactUpdateProcedure,
    consumerPaperCopyFeeDescription,
    consumerPaperCopyProcedure,
    consumerWithdrawalConsequences,
    consumerWithdrawalProcedure,
    signatureMode,
  ]);
  const fillAndSignNeedsValues = mode === 'fill_and_sign' && !hasMeaningfulFillValues;
  const anchorCount = defaultAnchors.length;
  const workflowLabel = mode === 'fill_and_sign' ? 'Fill and Sign' : 'Sign';
  const defaultTitle = buildDefaultTitle(sourceDocumentName, mode);
  const hasPendingRecipientDraft = Boolean(draftSignerName.trim() || draftSignerEmail.trim());
  const plannedRecipients = resolveRecipientsForSubmit();
  const plannedRecipientCount = plannedRecipients.length;
  const pendingDraftCount = effectiveCreatedRequests.filter((entry) => entry.status === 'draft').length;
  const batchNeedsOwnerReview = effectiveCreatedRequests.some((entry) => entry.mode === 'fill_and_sign');
  const createBlockedReason = resolveCreateBlockedReason({
    hasDocument,
    sourceDocumentName,
    options,
    optionsLoading,
    plannedRecipientCount,
    hasPendingRecipientDraft,
    documentCategory,
    blockedCategory,
    blockedCategoryReason: selectedCategory?.reason || null,
    esignEligibilityConfirmed,
    consumerDisclosureError,
    fillAndSignNeedsValues,
  });
  const sendBlockedReason = resolveSendBlockedReason({
    sendDisabledReason,
    batchNeedsOwnerReview,
    ownerReviewConfirmed,
    hasSendHandler: Boolean(onSendRequests || onSendRequest),
  });

  const readinessItems = [
    { label: 'PDF loaded', ready: hasDocument },
    { label: 'Recipients queued', ready: recipients.length > 0 || Boolean(pendingManualRecipient) },
    { label: 'Allowed category', ready: Boolean(documentCategory && !blockedCategory) },
    { label: 'Eligibility attested', ready: esignEligibilityConfirmed },
    { label: 'Company binding', ready: true },
    ...(signatureMode === 'consumer'
      ? [{ label: 'Consumer disclosures', ready: !consumerDisclosureError }]
      : []),
    {
      label: mode === 'fill_and_sign' ? 'Reviewed fill values' : 'Signature anchors',
      ready: mode === 'fill_and_sign' ? !fillAndSignNeedsValues : anchorCount > 0,
    },
  ];

  function pushRecipient(recipient: SigningRecipientInput | null) {
    if (!recipient) {
      setRecipientImportError('Enter a valid signer email before adding the recipient.');
      return;
    }
    clearActionValidationMessage();
    setRecipients((current) => mergeSigningRecipients(current, [recipient]));
    setDraftSignerName('');
    setDraftSignerEmail('');
    setRecipientImportError(null);
  }

  function resolveRecipientsForSubmit(): SigningRecipientInput[] {
    return pendingManualRecipient
      ? mergeSigningRecipients(recipients, [pendingManualRecipient])
      : recipients;
  }

  async function handleImportFromText() {
    const result = parseSigningRecipientsFromText(recipientImportText, {
      source: 'paste',
      csvMode: recipientImportText.includes(','),
    });
    if (!result.recipients.length && !result.rejected.length) {
      setRecipientImportError('Paste at least one email address, `Name <email>`, or CSV row before importing.');
      return;
    }
    clearActionValidationMessage();
    setRecipients((current) => mergeSigningRecipients(current, result.recipients));
    setRecipientImportError(joinRejectedRecipients(result.rejected));
    setRecipientImportText('');
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) return;
    try {
      const result = await parseSigningRecipientsFromFile(file);
      clearActionValidationMessage();
      setRecipients((current) => mergeSigningRecipients(current, result.recipients));
      setRecipientImportError(joinRejectedRecipients(result.rejected));
    } catch (error) {
      setRecipientImportError(error instanceof Error ? error.message : 'Unable to read the recipient file. Try a UTF-8 `.txt` or `.csv` file.');
    }
  }

  async function handleCreate() {
    const nextRecipients = resolveRecipientsForSubmit();
    setRecipients(nextRecipients);
    if (createBlockedReason || !sourceDocumentName || !nextRecipients.length) {
      setActionValidationMessage(createBlockedReason || 'Add at least one recipient before saving a signing draft.');
      return;
    }
    setActionValidationMessage(null);
    if (onCreateDraft && nextRecipients.length === 1) {
      const [recipient] = nextRecipients;
      await onCreateDraft({
        title: defaultTitle,
        mode,
        signatureMode,
        sourceType: mode === 'fill_and_sign' ? (fillAndSignContext?.sourceType || 'workspace') : 'workspace',
        sourceId: mode === 'fill_and_sign'
          ? fillAndSignContext?.sourceId || sourceTemplateId || undefined
          : sourceTemplateId || undefined,
        sourceLinkId: mode === 'fill_and_sign' ? fillAndSignContext?.sourceLinkId || undefined : undefined,
        sourceRecordLabel: mode === 'fill_and_sign' ? fillAndSignContext?.sourceRecordLabel || undefined : undefined,
        sourceDocumentName,
        sourceTemplateId: sourceTemplateId || undefined,
        sourceTemplateName: sourceTemplateName || undefined,
        documentCategory,
        esignEligibilityConfirmed,
        companyBindingEnabled,
        manualFallbackEnabled,
        consumerPaperCopyProcedure: consumerPaperCopyProcedure.trim() || undefined,
        consumerPaperCopyFeeDescription: consumerPaperCopyFeeDescription.trim() || undefined,
        consumerWithdrawalProcedure: consumerWithdrawalProcedure.trim() || undefined,
        consumerWithdrawalConsequences: consumerWithdrawalConsequences.trim() || undefined,
        consumerContactUpdateProcedure: consumerContactUpdateProcedure.trim() || undefined,
        consumerConsentScopeDescription: consumerConsentScopeDescription.trim() || undefined,
        signerName: recipient.name,
        signerEmail: recipient.email,
        anchors: defaultAnchors,
      });
      return;
    }
    await onCreateDrafts({
      title: defaultTitle,
      mode,
      signatureMode,
      sourceType: mode === 'fill_and_sign' ? (fillAndSignContext?.sourceType || 'workspace') : 'workspace',
      sourceId: mode === 'fill_and_sign'
        ? fillAndSignContext?.sourceId || sourceTemplateId || undefined
        : sourceTemplateId || undefined,
      sourceLinkId: mode === 'fill_and_sign' ? fillAndSignContext?.sourceLinkId || undefined : undefined,
      sourceRecordLabel: mode === 'fill_and_sign' ? fillAndSignContext?.sourceRecordLabel || undefined : undefined,
      sourceDocumentName,
      sourceTemplateId: sourceTemplateId || undefined,
      sourceTemplateName: sourceTemplateName || undefined,
      documentCategory,
      esignEligibilityConfirmed,
      companyBindingEnabled,
      manualFallbackEnabled,
      consumerPaperCopyProcedure: consumerPaperCopyProcedure.trim() || undefined,
      consumerPaperCopyFeeDescription: consumerPaperCopyFeeDescription.trim() || undefined,
      consumerWithdrawalProcedure: consumerWithdrawalProcedure.trim() || undefined,
      consumerWithdrawalConsequences: consumerWithdrawalConsequences.trim() || undefined,
      consumerContactUpdateProcedure: consumerContactUpdateProcedure.trim() || undefined,
      consumerConsentScopeDescription: consumerConsentScopeDescription.trim() || undefined,
      anchors: signingMode === 'separate'
        ? defaultAnchors
        : (defaultAnchors || []).map((anchor, i) => ({
            ...anchor,
            assignedSignerOrder: anchorAssignments.get(anchor.fieldId || `idx-${i}`),
          })),
      recipients: nextRecipients,
      signingMode,
    });
  }

  async function handleSend() {
    if (sendBlockedReason) {
      setActionValidationMessage(sendBlockedReason);
      return;
    }
    setActionValidationMessage(null);
    await (onSendRequests || onSendRequest)?.({ ownerReviewConfirmed });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Send PDF for Signature by email"
      description={(
        <span className="signature-request-dialog__intro">
          Create U.S. e-sign signing requests, freeze the exact PDF version, and email that immutable record into the signer ceremony.
        </span>
      )}
      className="signature-request-dialog"
      headerActions={(
        <button
          type="button"
          className="ui-button ui-button--ghost ui-button--compact"
          onClick={() => openUsageDocsWindow(USAGE_DOCS_ROUTES.signatureWorkflow)}
          title="Open Signature Workflow usage docs in a new window"
        >
          Usage Docs
        </button>
      )}
      closeOnBackdrop={false}
    >
      <div className="signature-request-dialog__body">
        <div className="signature-request-dialog__topbar">
          <div className="signature-request-dialog__tabs" role="tablist" aria-label="Signing tabs">
            <button
              type="button"
              className={activeTab === 'prepare' ? 'signature-request-dialog__tab signature-request-dialog__tab--active' : 'signature-request-dialog__tab'}
              onClick={() => setActiveTab('prepare')}
            >
              Prepare
            </button>
            <button
              type="button"
              className={activeTab === 'responses' ? 'signature-request-dialog__tab signature-request-dialog__tab--active' : 'signature-request-dialog__tab'}
              onClick={() => setActiveTab('responses')}
            >
              Responses
            </button>
          </div>
        </div>

        {!hasDocument ? (
          <Alert tone="error" variant="inline" message="Load a PDF in the workspace before starting a signing request." />
        ) : null}
        {error ? <Alert tone="error" variant="inline" message={error} /> : null}
        {actionValidationMessage ? <Alert tone="warning" variant="inline" message={actionValidationMessage} /> : null}
        {notice ? <Alert tone="success" variant="inline" message={notice} /> : null}
        {!notice && effectiveCreatedRequests.length ? (
          <Alert
            tone={effectiveCreatedRequests.every((entry) => entry.status === 'sent') ? 'success' : 'info'}
            variant="inline"
            message={
              effectiveCreatedRequests.every((entry) => entry.status === 'sent')
                ? effectiveCreatedRequests.length === 1
                  ? 'Signing request sent. Invite delivery status and signer progress now appear in Responses.'
                  : 'Signing requests sent. Invite delivery status and signer progress now appear in Responses.'
                : effectiveCreatedRequests.length === 1
                  ? 'Draft saved. The signer link stays inactive until you click Review and Send.'
                  : 'Drafts saved. Review the batch summary, then click Review and Send to activate signer links.'
            }
          />
        ) : null}

        {activeTab === 'responses' ? (
          <SigningResponsesPanel
            requests={responses}
            loading={responsesLoading}
            sourceDocumentName={sourceDocumentName}
            sourceTemplateId={sourceTemplateId}
            revokingRequestId={revokingRequestId}
            reissuingRequestId={reissuingRequestId}
            onRevoke={onRevokeRequest}
            onReissue={onReissueRequest}
            onRefresh={onRefreshResponses}
          />
        ) : (
          <>
            <section className="signature-request-dialog__hero" aria-label="Signing request overview">
              <div className="signature-request-dialog__hero-copy">
                <span className="signature-request-dialog__eyebrow">Signing setup</span>
                <h3>{workflowLabel === 'Fill and Sign' ? 'Freeze the reviewed record, then route it to signature.' : 'Freeze the active PDF, then send it to signature.'}</h3>
                <p className="signature-request-dialog__supporting-copy">{describeMode(mode, fillAndSignContext)}</p>
              </div>
              <div className="signature-request-dialog__hero-facts">
                <div className="signature-request-dialog__metric">
                  <span className="signature-request-dialog__label">Workflow</span>
                  <strong>{workflowLabel}</strong>
                </div>
                <div className="signature-request-dialog__metric">
                  <span className="signature-request-dialog__label">Signature mode</span>
                  <strong>{signatureMode === 'consumer' ? 'Consumer' : 'Business'}</strong>
                </div>
                <div className="signature-request-dialog__metric">
                  <span className="signature-request-dialog__label">Recipients</span>
                  <strong>{plannedRecipientCount}</strong>
                </div>
                <div className="signature-request-dialog__metric">
                  <span className="signature-request-dialog__label">Anchors</span>
                  <strong>{anchorCount}</strong>
                </div>
                <div className="signature-request-dialog__metric">
                  <span className="signature-request-dialog__label">Signing mode</span>
                  <strong>{signingMode === 'sequential' ? 'Sequential' : signingMode === 'parallel' ? 'Parallel' : 'Separate'}</strong>
                </div>
              </div>
            </section>

            <div className="signature-request-dialog__layout">
              <div className="signature-request-dialog__column signature-request-dialog__column--main">
                <section className="signature-request-dialog__section">
                  <h3>Workflow</h3>
                  <div className="signature-request-dialog__mode-row" role="tablist" aria-label="Signing mode">
                    <button
                      type="button"
                      className={mode === 'sign' ? 'ui-button ui-button--primary' : 'ui-button ui-button--ghost'}
                      onClick={() => {
                        clearActionValidationMessage();
                        setMode('sign');
                      }}
                    >
                      Sign
                    </button>
                    <button
                      type="button"
                      className={mode === 'fill_and_sign' ? 'ui-button ui-button--primary' : 'ui-button ui-button--ghost'}
                      onClick={() => {
                        clearActionValidationMessage();
                        setMode('fill_and_sign');
                      }}
                    >
                      Fill and Sign
                    </button>
                  </div>
                  <p className="signature-request-dialog__supporting-copy">{describeMode(mode, fillAndSignContext)}</p>
                </section>

                <section className="signature-request-dialog__section">
                  <h3>Signing Mode</h3>
                  <div className="signature-request-dialog__mode-row" role="tablist" aria-label="Signing mode">
                    <button
                      type="button"
                      className={signingMode === 'separate' ? 'ui-button ui-button--primary' : 'ui-button ui-button--ghost'}
                      onClick={() => {
                        clearActionValidationMessage();
                        setSigningMode('separate');
                        setAnchorAssignments(new Map());
                      }}
                    >
                      Separate
                    </button>
                    <button
                      type="button"
                      className={signingMode === 'parallel' ? 'ui-button ui-button--primary' : 'ui-button ui-button--ghost'}
                      onClick={() => {
                        clearActionValidationMessage();
                        setSigningMode('parallel');
                      }}
                    >
                      Parallel
                    </button>
                    <button
                      type="button"
                      className={signingMode === 'sequential' ? 'ui-button ui-button--primary' : 'ui-button ui-button--ghost'}
                      onClick={() => {
                        clearActionValidationMessage();
                        setSigningMode('sequential');
                      }}
                    >
                      Sequential
                    </button>
                  </div>
                  <p className="signature-request-dialog__supporting-copy">
                    {signingMode === 'separate'
                      ? 'Each signer gets their own independent copy and signs individually.'
                      : signingMode === 'parallel'
                        ? 'All signers share one document and are notified simultaneously. One final signed PDF.'
                        : 'Signers share one document and go in listed order. Each is notified after the previous one completes.'}
                  </p>
                </section>

                <section className="signature-request-dialog__section">
                  <h3>Document</h3>
                  <div className="signature-request-dialog__fact-grid">
                    <div>
                      <span className="signature-request-dialog__label">Source document</span>
                      <strong>{sourceDocumentName || 'No active document'}</strong>
                    </div>
                    <div>
                      <span className="signature-request-dialog__label">Template context</span>
                      <strong>{sourceTemplateName || 'Unsaved workspace document'}</strong>
                    </div>
                    <div>
                      <span className="signature-request-dialog__label">Detected anchors</span>
                      <strong>{anchorCount}</strong>
                    </div>
                    {mode === 'fill_and_sign' ? (
                      <div>
                        <span className="signature-request-dialog__label">Reviewed fill source</span>
                        <strong>{describeFillAndSignSource(fillAndSignContext)}</strong>
                      </div>
                    ) : null}
                  </div>
                  {mode === 'fill_and_sign' && fillAndSignNeedsValues ? (
                    <Alert
                      tone="warning"
                      variant="inline"
                      message="Fill and Sign needs reviewed field values in the workspace. Fill the PDF first, then create the signing draft."
                    />
                  ) : null}
                </section>

                <section className="signature-request-dialog__section">
                  <h3>Policy</h3>
                  <div className="signature-request-dialog__field-grid">
                    <label className="signature-request-dialog__field">
                      <span>Signature mode</span>
                      <select
                        name="signature_mode"
                        value={signatureMode}
                        onChange={(event) => {
                          clearActionValidationMessage();
                          setSignatureMode(event.target.value as WorkspaceSigningDraftPayload['signatureMode']);
                        }}
                      >
                        {(options?.signatureModes || []).map((entry) => (
                          <option key={entry.key} value={entry.key}>{entry.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="signature-request-dialog__field">
                      <span>Document category</span>
                      <select
                        name="document_category"
                        value={documentCategory}
                        onChange={(event) => {
                          clearActionValidationMessage();
                          setDocumentCategory(event.target.value);
                        }}
                      >
                        {(options?.categories || []).map((entry: SigningCategoryOption) => (
                          <option key={entry.key} value={entry.key} disabled={entry.blocked}>
                            {entry.blocked ? `${entry.label} (Blocked)` : entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {blockedCategory && selectedCategory?.reason ? (
                    <Alert tone="error" variant="inline" message={selectedCategory.reason} />
                  ) : null}
                  <label className="signature-request-dialog__checkbox">
                    <input
                      name="esign_eligibility_confirmed"
                      type="checkbox"
                      checked={esignEligibilityConfirmed}
                      onChange={(event) => {
                        clearActionValidationMessage();
                        setEsignEligibilityConfirmed(event.target.checked);
                      }}
                    />
                    <span>
                      DullyPDF does not auto-classify legal document types. I reviewed the blocked-category list, including court, family-law, UCC-excluded, recall/safety, and primary-residence notice categories, and confirm this document is eligible for DullyPDF&apos;s U.S. e-sign flow.
                    </span>
                  </label>
                  <label className="signature-request-dialog__checkbox">
                    <input
                      name="manual_fallback_enabled"
                      type="checkbox"
                      checked={manualFallbackEnabled}
                      onChange={(event) => setManualFallbackEnabled(event.target.checked)}
                    />
                    <span>Allow a paper/manual fallback path for this request</span>
                  </label>
                  <label className="signature-request-dialog__checkbox">
                    <input
                      name="company_binding_enabled"
                      type="checkbox"
                      checked={companyBindingEnabled}
                      onChange={(event) => setCompanyBindingEnabled(event.target.checked)}
                    />
                    <span>Require a signer authority attestation because this request is intended to bind a company or organization</span>
                  </label>
                  {companyBindingEnabled ? (
                    <Alert
                      tone="info"
                      variant="inline"
                      message="At final signing, DullyPDF will require the signer to enter their title and company name and attest that they are authorized to bind that entity. DullyPDF records that attestation but does not independently verify corporate authority."
                    />
                  ) : null}
                  {signatureMode === 'consumer' ? (
                    <>
                      {consumerDisclosureError ? (
                        <Alert tone="warning" variant="inline" message={consumerDisclosureError} />
                      ) : null}
                      <div className="signature-request-dialog__field-grid">
                        <label className="signature-request-dialog__field signature-request-dialog__field--textarea">
                          <span>Paper-copy or offline procedure</span>
                          <textarea
                            name="consumer_paper_copy_procedure"
                            value={consumerPaperCopyProcedure}
                            onChange={(event) => {
                              clearActionValidationMessage();
                              setConsumerPaperCopyProcedure(event.target.value);
                            }}
                            placeholder="Explain exactly how the signer can request paper delivery or offline processing for this request."
                          />
                        </label>
                        <label className="signature-request-dialog__field signature-request-dialog__field--textarea">
                          <span>Paper-copy fee disclosure</span>
                          <textarea
                            name="consumer_paper_copy_fee_description"
                            value={consumerPaperCopyFeeDescription}
                            onChange={(event) => {
                              clearActionValidationMessage();
                              setConsumerPaperCopyFeeDescription(event.target.value);
                            }}
                            placeholder="State any paper-copy, courier, or handling fee, or say no fee is charged."
                          />
                        </label>
                        <label className="signature-request-dialog__field signature-request-dialog__field--textarea">
                          <span>Withdrawal procedure</span>
                          <textarea
                            name="consumer_withdrawal_procedure"
                            value={consumerWithdrawalProcedure}
                            onChange={(event) => {
                              clearActionValidationMessage();
                              setConsumerWithdrawalProcedure(event.target.value);
                            }}
                            placeholder="Explain how the signer withdraws e-consent before completion."
                          />
                        </label>
                        <label className="signature-request-dialog__field signature-request-dialog__field--textarea">
                          <span>Withdrawal consequences</span>
                          <textarea
                            name="consumer_withdrawal_consequences"
                            value={consumerWithdrawalConsequences}
                            onChange={(event) => {
                              clearActionValidationMessage();
                              setConsumerWithdrawalConsequences(event.target.value);
                            }}
                            placeholder="Explain what happens to this request after consent is withdrawn."
                          />
                        </label>
                        <label className="signature-request-dialog__field signature-request-dialog__field--textarea">
                          <span>Contact-update procedure</span>
                          <textarea
                            name="consumer_contact_update_procedure"
                            value={consumerContactUpdateProcedure}
                            onChange={(event) => {
                              clearActionValidationMessage();
                              setConsumerContactUpdateProcedure(event.target.value);
                            }}
                            placeholder="Explain how the signer updates email or contact information before completion."
                          />
                        </label>
                        <label className="signature-request-dialog__field signature-request-dialog__field--textarea">
                          <span>Consent scope override (optional)</span>
                          <textarea
                            name="consumer_consent_scope_description"
                            value={consumerConsentScopeDescription}
                            onChange={(event) => {
                              clearActionValidationMessage();
                              setConsumerConsentScopeDescription(event.target.value);
                            }}
                            placeholder="Leave blank to scope consent to this signing request only."
                          />
                        </label>
                      </div>
                    </>
                  ) : null}
                </section>

                <section className="signature-request-dialog__section">
                  <div className="signature-request-dialog__section-header">
                    <div>
                      <h3>Recipients</h3>
                      <p className="signature-request-dialog__supporting-copy">
                        Add one signer manually, paste TXT/CSV rows, or upload a `.txt` / `.csv` file to queue a batch.
                      </p>
                    </div>
                    <span className="signature-request-dialog__recipient-count">{plannedRecipientCount} queued</span>
                  </div>

                  <div className="signature-request-dialog__recipient-builder">
                    <div className="signature-request-dialog__field-grid">
                      <label className="signature-request-dialog__field">
                        <span>Signer name</span>
                        <input
                          name="draft_signer_name"
                          value={draftSignerName}
                          onChange={(event) => {
                            clearActionValidationMessage();
                            setDraftSignerName(event.target.value);
                          }}
                        />
                      </label>
                      <label className="signature-request-dialog__field">
                        <span>Signer email</span>
                        <input
                          name="draft_signer_email"
                          type="email"
                          value={draftSignerEmail}
                          onChange={(event) => {
                            clearActionValidationMessage();
                            setDraftSignerEmail(event.target.value);
                          }}
                        />
                      </label>
                    </div>
                    <div className="signature-request-dialog__recipient-builder-actions">
                      <button
                        type="button"
                        className="ui-button ui-button--ghost"
                        onClick={() => pushRecipient(normalizeSigningRecipient(draftSignerName, draftSignerEmail, 'manual'))}
                      >
                        Add recipient
                      </button>
                    </div>
                  </div>
                  {pendingManualRecipient ? (
                    <p className="signature-request-dialog__supporting-copy">
                      Pending manual recipient will be included automatically when you save drafts.
                    </p>
                  ) : null}

                  <div className="signature-request-dialog__import-grid">
                    <label className="signature-request-dialog__field signature-request-dialog__field--textarea">
                      <span>Paste TXT or CSV rows</span>
                      <textarea
                        name="recipient_import_text"
                        value={recipientImportText}
                        onChange={(event) => {
                          clearActionValidationMessage();
                          setRecipientImportText(event.target.value);
                        }}
                        placeholder={'alex@example.com\nTaylor Example,taylor@example.com\nJordan Example <jordan@example.com>'}
                      />
                    </label>
                    <div className="signature-request-dialog__import-actions">
                      <button
                        type="button"
                        className="ui-button ui-button--ghost"
                        onClick={() => { void handleImportFromText(); }}
                      >
                        Import pasted recipients
                      </button>
                      <label className="ui-button ui-button--ghost signature-request-dialog__file-button">
                        Upload .txt or .csv
                        <input
                          name="recipient_import_file"
                          type="file"
                          accept=".txt,.csv,text/plain,text/csv"
                          onChange={(event) => { void handleImportFile(event); }}
                        />
                      </label>
                      <p className="signature-request-dialog__supporting-copy">
                        If a row only includes an email address, DullyPDF will derive the display name from the email local part.
                      </p>
                    </div>
                  </div>

                  {recipientImportError ? <Alert tone="warning" variant="inline" message={recipientImportError} /> : null}

                  <div className="signature-request-dialog__recipient-list">
                    {recipients.length ? recipients.map((recipient, index) => (
                      <article
                        key={recipient.email}
                        className={`signature-request-dialog__recipient-card${signingMode === 'sequential' ? ' signature-request-dialog__recipient-card--sequential' : ''}`}
                      >
                        {signingMode === 'sequential' && (
                          <span className="signature-request-dialog__recipient-order">{index + 1}</span>
                        )}
                        <div>
                          <strong>{recipient.name}</strong>
                          <span>{recipient.email}</span>
                        </div>
                        <div className="signature-request-dialog__recipient-card-actions">
                          {signingMode === 'sequential' && (
                            <>
                              <button
                                type="button"
                                className="signature-request-dialog__reorder-btn"
                                disabled={index === 0}
                                onClick={() => moveRecipient(index, 'up')}
                                aria-label="Move up"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="signature-request-dialog__reorder-btn"
                                disabled={index === recipients.length - 1}
                                onClick={() => moveRecipient(index, 'down')}
                                aria-label="Move down"
                              >
                                ↓
                              </button>
                            </>
                          )}
                          <span className="signature-request-dialog__response-badge signature-request-dialog__response-badge--muted">
                            {recipient.source}
                          </span>
                          <button
                            type="button"
                            className="ui-button ui-button--ghost"
                            onClick={() => {
                              clearActionValidationMessage();
                              setRecipients((current) => current.filter((entry) => entry.email !== recipient.email));
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    )) : (
                      <div className="signature-request-dialog__empty-state">
                        No recipients queued yet.
                      </div>
                    )}
                  </div>
                </section>

                {signingMode !== 'separate' && recipients.length > 0 && defaultAnchors && defaultAnchors.length > 0 && (
                  <section className="signature-request-dialog__section">
                    <h3>Assign Signature Fields</h3>
                    <p className="signature-request-dialog__supporting-copy">
                      Assign each signature field to the signer who should fill it. Multiple fields can be assigned to the same signer.
                    </p>
                    <div className="signature-request-dialog__anchor-assignment">
                      {defaultAnchors.map((anchor, index) => {
                        const anchorKey = anchor.fieldId || `idx-${index}`;
                        const assignedOrder = anchorAssignments.get(anchorKey);
                        return (
                          <div key={anchorKey} className="signature-request-dialog__anchor-row">
                            <span>
                              {anchor.kind === 'signature' ? 'Signature' : anchor.kind === 'signed_date' ? 'Signed Date' : 'Initials'}
                              {' '}(Page {anchor.page}{anchor.fieldName ? `, "${anchor.fieldName}"` : ''})
                            </span>
                            <select
                              value={assignedOrder ?? ''}
                              onChange={(e) => {
                                const value = e.target.value ? Number(e.target.value) : undefined;
                                setAnchorAssignments((prev) => {
                                  const next = new Map(prev);
                                  if (value === undefined) {
                                    next.delete(anchorKey);
                                  } else {
                                    next.set(anchorKey, value);
                                  }
                                  return next;
                                });
                              }}
                            >
                              <option value="">— Select signer —</option>
                              {recipients.map((r, ri) => (
                                <option key={r.email} value={ri + 1}>
                                  {r.name} ({r.email})
                                </option>
                              ))}
                            </select>
                            {assignedOrder != null && (
                              <span
                                className="signature-request-dialog__signer-dot"
                                style={{ backgroundColor: signerColorForOrder(assignedOrder) }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>

              <aside className="signature-request-dialog__column signature-request-dialog__column--side">
                <section className="signature-request-dialog__section signature-request-dialog__section--summary">
                  <h3>Draft readiness</h3>
                  <p className="signature-request-dialog__supporting-copy">
                    Saving stores the request policy, signer batch, source provenance, and the exact reviewed source hash that will be checked again before send.
                  </p>
                  <div className="signature-request-dialog__draft-preview">
                    <span className="signature-request-dialog__label">Draft title</span>
                    <strong>{defaultTitle}</strong>
                  </div>
                  <ul className="signature-request-dialog__checklist">
                    {readinessItems.map((item) => (
                      <li key={item.label} className={item.ready ? 'signature-request-dialog__checklist-item signature-request-dialog__checklist-item--ready' : 'signature-request-dialog__checklist-item'}>
                        <span className="signature-request-dialog__check-indicator" aria-hidden="true">{item.ready ? 'Ready' : 'Needs work'}</span>
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                {effectiveCreatedRequests.length ? (
                  <section className="signature-request-dialog__section signature-request-dialog__section--summary">
                    <h3>Batch review and send</h3>
                    <div className="signature-request-dialog__response-grid">
                      <div>
                        <span className="signature-request-dialog__label">Batch status</span>
                        <strong>{resolveBatchStatus(effectiveCreatedRequests)}</strong>
                      </div>
                      <div>
                        <span className="signature-request-dialog__label">Requests</span>
                        <strong>{effectiveCreatedRequests.length}</strong>
                      </div>
                      <div>
                        <span className="signature-request-dialog__label">Source version</span>
                        <strong>{effectiveCreatedRequests[0]?.sourceVersion || 'Pending'}</strong>
                      </div>
                      <div>
                        <span className="signature-request-dialog__label">Category</span>
                        <strong>{effectiveCreatedRequests[0]?.documentCategoryLabel || 'Pending'}</strong>
                      </div>
                      <div>
                        <span className="signature-request-dialog__label">Pending sends</span>
                        <strong>{pendingDraftCount}</strong>
                      </div>
                      <div>
                        <span className="signature-request-dialog__label">Source SHA-256</span>
                        <strong className="signature-request-dialog__hash">{effectiveCreatedRequests[0]?.sourcePdfSha256 || 'Pending'}</strong>
                      </div>
                    </div>
                    {sendDisabledReason ? (
                      <Alert tone="info" variant="inline" message={sendDisabledReason} />
                    ) : null}
                    {effectiveCreatedRequests.some((entry) => entry.inviteDeliveryStatus === 'failed' || entry.inviteDeliveryStatus === 'skipped') ? (
                      <Alert
                        tone="warning"
                        variant="inline"
                        message="One or more invite emails were not delivered automatically. Use the Responses tab to copy signer links and follow up manually."
                      />
                    ) : null}
                    {(mode === 'fill_and_sign' || batchNeedsOwnerReview) ? (
                      <label className="signature-request-dialog__checkbox">
                        <input
                          name="owner_review_confirmed"
                          type="checkbox"
                          checked={ownerReviewConfirmed}
                          onChange={(event) => {
                            clearActionValidationMessage();
                            setOwnerReviewConfirmed(event.target.checked);
                          }}
                        />
                        <span>I reviewed the filled PDF and want to freeze this exact version for signature.</span>
                      </label>
                    ) : null}
                    <p className="signature-request-dialog__supporting-copy">
                      Sending stores an immutable source PDF snapshot and moves each request from draft to sent. If the source PDF changes before send,
                      the affected drafts will be invalidated and must be recreated.
                    </p>
                  </section>
                ) : null}
              </aside>
            </div>
          </>
        )}
      </div>

      <div className="ui-dialog__actions signature-request-dialog__actions">
        {activeTab === 'prepare' && effectiveCreatedRequests.length ? (
          <button
            className="ui-button ui-button--ghost"
            type="button"
            onClick={() => { void handleSend(); }}
            disabled={sending}
          >
            {sending ? 'Sending requests…' : 'Review and Send'}
          </button>
        ) : null}
        {activeTab === 'prepare' ? (
          <button
            className="ui-button ui-button--primary"
            type="button"
            onClick={() => { void handleCreate(); }}
            disabled={saving}
          >
            {saving ? 'Saving drafts…' : plannedRecipientCount <= 1 ? 'Save Signing Draft' : 'Save Signing Drafts'}
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}

export default SignatureRequestDialog;
