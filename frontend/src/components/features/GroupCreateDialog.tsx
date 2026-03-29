import { useEffect, useId, useMemo, useState } from 'react';
import type { SavedFormSummary } from '../../services/api';
import { DialogCloseButton, DialogFrame } from '../ui/Dialog';
import './GroupCreateDialog.css';

type GroupCreateDialogProps = {
  open: boolean;
  savedForms: SavedFormSummary[];
  submitting?: boolean;
  mode?: 'create' | 'edit';
  initialName?: string;
  initialSelectedIds?: string[];
  onClose: () => void;
  onSubmit: (payload: { name: string; templateIds: string[] }) => Promise<void> | void;
};

export function GroupCreateDialog({
  open,
  savedForms,
  submitting = false,
  mode = 'create',
  initialName = '',
  initialSelectedIds = [],
  onClose,
  onSubmit,
}: GroupCreateDialogProps) {
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const initialSelectedIdsKey = initialSelectedIds.join('\u0000');

  const sortedForms = useMemo(
    () => [...savedForms].sort((left, right) => {
      const leftLocked = Boolean(left.locked || left.accessStatus === 'locked');
      const rightLocked = Boolean(right.locked || right.accessStatus === 'locked');
      if (leftLocked !== rightLocked) {
        return leftLocked ? 1 : -1;
      }
      return left.name.localeCompare(right.name);
    }),
    [savedForms],
  );

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setSelectedIds(initialSelectedIds);
    setLocalError(null);
  }, [initialName, initialSelectedIdsKey, open]);

  const dialogTitle = mode === 'edit' ? 'Edit Group' : 'Create Group';
  const dialogCopy = mode === 'edit'
    ? 'Rename this group and adjust which saved forms belong to it.'
    : 'Pick a group name and the saved forms that belong in it.';
  const submitLabel = mode === 'edit'
    ? (submitting ? 'Saving…' : 'Save group')
    : (submitting ? 'Creating…' : 'Create group');

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setLocalError('Group name is required.');
      return;
    }
    if (selectedIds.length === 0) {
      setLocalError('Select at least one saved form.');
      return;
    }
    setLocalError(null);
    try {
      await onSubmit({ name: trimmedName, templateIds: selectedIds });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Unable to save this group right now.');
    }
  };

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      className="group-create-modal"
      labelledBy={dialogTitleId}
      describedBy={dialogDescriptionId}
    >
      <div className="group-create-modal__header">
        <div>
          <h2 id={dialogTitleId}>{dialogTitle}</h2>
          <p id={dialogDescriptionId}>{dialogCopy}</p>
        </div>
        <DialogCloseButton onClick={onClose} label={`Close ${dialogTitle} dialog`} />
      </div>
      <label className="group-create-modal__field">
        <span>Group name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (localError) setLocalError(null);
          }}
          placeholder="New hire packet"
          maxLength={120}
          disabled={submitting}
        />
      </label>
      <div className="group-create-modal__field group-create-modal__field--list">
        <span>Saved forms</span>
        {sortedForms.length === 0 ? (
          <div className="group-create-modal__empty">Save at least one form before creating a group.</div>
        ) : (
          <div className="group-create-modal__list-shell">
            <div className="group-create-modal__list-meta">
              {selectedIds.length} selected of {sortedForms.length} saved form{sortedForms.length === 1 ? '' : 's'}
            </div>
            <div className="group-create-modal__list">
              {sortedForms.map((form) => {
                const checked = selectedIds.includes(form.id);
                const locked = Boolean(form.locked || form.accessStatus === 'locked');
                return (
                  <label
                    key={form.id}
                    className="group-create-modal__item"
                    aria-disabled={locked}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={submitting || locked}
                      onChange={(event) => {
                        setSelectedIds((prev) => {
                          if (event.target.checked) {
                            return [...prev, form.id];
                          }
                          return prev.filter((entry) => entry !== form.id);
                        });
                        if (localError) setLocalError(null);
                      }}
                    />
                    <span>
                      {form.name}
                      {locked ? ' (Locked on base)' : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {localError ? <div className="group-create-modal__error">{localError}</div> : null}
      <div className="group-create-modal__actions">
        <button type="button" className="ui-button ui-button--ghost" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className="ui-button ui-button--primary"
          disabled={submitting || sortedForms.length === 0}
          onClick={() => { void handleSubmit(); }}
        >
          {submitLabel}
        </button>
      </div>
    </DialogFrame>
  );
}
