import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import type { DowngradeRetentionSummary } from '../../services/api';
import './DowngradeRetentionDialog.css';

type DowngradeRetentionDialogProps = {
  open: boolean;
  retention: DowngradeRetentionSummary | null;
  billingEnabled: boolean;
  savingSelection?: boolean;
  checkoutInProgress?: boolean;
  reactivateLabel?: string;
  onClose: () => void;
  onSaveSelection: (keptTemplateIds: string[]) => void;
  onReactivatePremium: () => void;
};

function formatRetentionDate(value?: string | null): string {
  if (!value) return 'Unknown date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown date';
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function buildTemplateSelectionKey(templateIds: string[]): string {
  return [...new Set(templateIds)].sort().join('|');
}

function resolveTemplateAccessStatus(
  status: string | null | undefined,
  locked: boolean | null | undefined,
): 'accessible' | 'locked' {
  if (locked || status === 'locked' || status === 'pending_delete') {
    return 'locked';
  }
  return 'accessible';
}

export function DowngradeRetentionDialog({
  open,
  retention,
  billingEnabled,
  savingSelection = false,
  checkoutInProgress = false,
  reactivateLabel = 'Reactivate Pro Monthly',
  onClose,
  onSaveSelection,
  onReactivatePremium,
}: DowngradeRetentionDialogProps) {
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !retention) return;
    setSelectedTemplateIds(retention.keptTemplateIds);
  }, [open, retention]);

  const keepLimit = Math.max(0, retention?.savedFormsLimit ?? 0);
  const accessibleTemplateIds = retention?.accessibleTemplateIds ?? retention?.keptTemplateIds ?? [];
  const lockedTemplateIds = retention?.lockedTemplateIds ?? retention?.pendingDeleteTemplateIds ?? [];
  const accessibleTemplateCount = accessibleTemplateIds.length || retention?.counts.keptTemplates || 0;
  const lockedTemplateCount = lockedTemplateIds.length || retention?.counts.pendingTemplates || 0;
  const lockedLinkCount = retention?.lockedLinkIds?.length || retention?.counts.pendingLinks || 0;
  const affectedSigningRequestCount = retention?.counts.affectedSigningRequests ?? 0;
  const affectedSigningDraftCount = retention?.counts.affectedSigningDrafts ?? 0;
  const retainedSigningRequestCount = retention?.counts.retainedSigningRequests ?? 0;
  const manualSelectionAllowed = retention?.manualSelectionAllowed === true;
  const selectedCount = selectedTemplateIds.length;
  const actionsBusy = savingSelection || checkoutInProgress;
  const initialSelectionKey = buildTemplateSelectionKey(retention?.keptTemplateIds ?? []);
  const selectedSelectionKey = buildTemplateSelectionKey(selectedTemplateIds);
  const canSaveSelection = Boolean(
    retention &&
    manualSelectionAllowed &&
    !actionsBusy &&
    selectedCount === keepLimit &&
    initialSelectionKey !== selectedSelectionKey,
  );

  const templateRows = useMemo(() => retention?.templates ?? [], [retention]);

  const handleToggleTemplate = (templateId: string) => {
    setSelectedTemplateIds((previous) => {
      if (previous.includes(templateId)) {
        return previous.filter((entry) => entry !== templateId);
      }
      if (previous.length >= keepLimit) {
        return previous;
      }
      return [...previous, templateId];
    });
  };

  if (!retention) return null;

  return (
    <Dialog
      open={open}
      title="Base plan template access"
      description={(
        <div className="retention-dialog__description">
          <p>
            Your account is on the base plan. The first <strong>{keepLimit}</strong> created saved form
            {keepLimit === 1 ? '' : 's'} stay accessible, and the remaining <strong>{lockedTemplateCount}</strong>{' '}
            saved form{lockedTemplateCount === 1 ? '' : 's'} stay stored but locked until you upgrade.
          </p>
          <p>
            Locked templates are preserved in place. Fill By Link, API Fill, group, and signing draft or new-send flows
            tied to those templates stay blocked instead of being deleted.
          </p>
          {affectedSigningRequestCount ? (
            <p>
              {affectedSigningDraftCount ? (
                <>
                  {affectedSigningDraftCount} signing draft{affectedSigningDraftCount === 1 ? '' : 's'} tied to locked
                  saved forms cannot be sent until those templates are accessible again.
                </>
              ) : null}
              {retainedSigningRequestCount ? (
                <>
                  {' '}
                  {retainedSigningRequestCount} already sent or completed signing request
                  {retainedSigningRequestCount === 1 ? '' : 's'} stay retained.
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      )}
      onClose={onClose}
      className="retention-dialog"
      footer={(
        <div className="retention-dialog__footer">
          <button type="button" className="ui-button ui-button--ghost" onClick={onClose} disabled={actionsBusy}>
            Keep base plan
          </button>
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={onReactivatePremium}
            disabled={!billingEnabled || actionsBusy}
          >
            {checkoutInProgress ? 'Starting checkout...' : reactivateLabel}
          </button>
        </div>
      )}
    >
      <div className="retention-dialog__meta">
        <div className="retention-dialog__stat">
          <span>Accessible</span>
          <strong>{accessibleTemplateCount}</strong>
        </div>
        <div className="retention-dialog__stat">
          <span>Locked templates</span>
          <strong>{lockedTemplateCount}</strong>
        </div>
        <div className="retention-dialog__stat">
          <span>Locked links</span>
          <strong>{lockedLinkCount}</strong>
        </div>
        <div className="retention-dialog__stat">
          <span>Signing requests affected</span>
          <strong>{affectedSigningRequestCount}</strong>
        </div>
      </div>

      <div className="retention-dialog__selection">
        <div className="retention-dialog__selection-header">
          <div>
            <h3>{manualSelectionAllowed ? 'Keep these saved forms' : 'Accessible and locked saved forms'}</h3>
            {manualSelectionAllowed ? (
              <p>
                Select exactly {keepLimit}. Oldest-first is the default, but this legacy policy still allows you to
                choose which saved forms stay accessible.
              </p>
            ) : (
              <p>
                Access is pinned to the earliest-created saved forms on base. Manual swapping is not available in this
                policy version.
              </p>
            )}
          </div>
          {manualSelectionAllowed ? (
            <button
              type="button"
              className="ui-button ui-button--primary"
              onClick={() => onSaveSelection(selectedTemplateIds)}
              disabled={!canSaveSelection}
            >
              {savingSelection ? 'Saving selection...' : 'Save kept forms'}
            </button>
          ) : null}
        </div>
        {manualSelectionAllowed ? (
          <p className="retention-dialog__selection-count">
            {selectedCount} of {keepLimit} selected
          </p>
        ) : null}
        <div className="retention-dialog__template-list" role="list">
          {templateRows.map((template) => {
            const accessStatus = resolveTemplateAccessStatus(template.accessStatus, template.locked);
            const checked = manualSelectionAllowed
              ? selectedTemplateIds.includes(template.id)
              : accessStatus === 'accessible';
            const createdAtLabel = formatRetentionDate(template.createdAt);
            return (
              <div
                key={template.id}
                className={[
                  'retention-dialog__template',
                  checked ? 'retention-dialog__template--checked' : '',
                  !manualSelectionAllowed ? 'retention-dialog__template--readonly' : '',
                ].filter(Boolean).join(' ')}
              >
                {manualSelectionAllowed ? (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleTemplate(template.id)}
                    disabled={actionsBusy}
                  />
                ) : (
                  <span
                    className={`retention-dialog__template-indicator retention-dialog__template-indicator--${accessStatus}`}
                    aria-hidden="true"
                  />
                )}
                <div className="retention-dialog__template-body">
                  <span className="retention-dialog__template-name">{template.name}</span>
                  <span className="retention-dialog__template-date">Created {createdAtLabel}</span>
                </div>
                <span
                  className={`retention-dialog__template-status retention-dialog__template-status--${accessStatus}`}
                >
                  {accessStatus === 'accessible' ? 'Accessible' : 'Locked'}
                </span>
              </div>
            );
          })}
        </div>
        {affectedSigningRequestCount ? (
          <p className="retention-dialog__note">
            Sent and completed signing requests keep their retained records. Drafts tied to locked forms are blocked
            from send until you upgrade and restore access.
          </p>
        ) : null}
        {!billingEnabled ? (
          <p className="retention-dialog__note">
            Stripe billing is currently unavailable, so reactivation is temporarily disabled.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

export default DowngradeRetentionDialog;
