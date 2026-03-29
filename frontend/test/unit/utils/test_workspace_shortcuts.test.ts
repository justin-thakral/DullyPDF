import { afterEach, describe, expect, it } from 'vitest';

import { shouldIgnoreWorkspaceHotkeys } from '../../../src/utils/workspaceShortcuts';

describe('workspaceShortcuts utils', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('ignores editor hotkeys while typing in form controls', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    expect(shouldIgnoreWorkspaceHotkeys(input)).toBe(true);
  });

  it('ignores editor hotkeys while an aria-modal dialog is open', () => {
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);

    expect(shouldIgnoreWorkspaceHotkeys(document.body)).toBe(true);
  });

  it('allows editor hotkeys when focus is in the workspace and no modal is open', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);

    expect(shouldIgnoreWorkspaceHotkeys(button)).toBe(false);
  });
});
