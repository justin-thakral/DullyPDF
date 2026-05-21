import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DownloadPagesDialog } from '../../../../src/components/features/DownloadPagesDialog';

describe('DownloadPagesDialog', () => {
  it('selects a range and downloads the requested output mode', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();

    render(
      <DownloadPagesDialog
        open
        pageCount={5}
        currentPage={3}
        sourceFileName="packet.pdf"
        onClose={vi.fn()}
        onDownload={onDownload}
      />,
    );

    expect(screen.getByText('packet.pdf')).toBeTruthy();
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: '3' }).getAttribute('aria-pressed')).toBe('true');

    const rangeInput = screen.getByRole('textbox', { name: 'Page range' });
    await user.clear(rangeInput);
    await user.type(rangeInput, '1, 5-4');
    await user.click(screen.getByRole('button', { name: 'Apply Range' }));
    await user.click(screen.getByRole('button', { name: 'Flat PDF' }));
    await user.click(screen.getByRole('button', { name: 'Download Selected Pages' }));

    expect(screen.getByText('3 selected')).toBeTruthy();
    expect(screen.getByText('Selected pages: 1, 5, 4')).toBeTruthy();
    expect(onDownload).toHaveBeenCalledWith({
      pages: [1, 5, 4],
      exportMode: 'flat',
    });
  });

  it('shows a useful validation error for invalid page ranges', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();

    render(
      <DownloadPagesDialog
        open
        pageCount={2}
        currentPage={1}
        onClose={vi.fn()}
        onDownload={onDownload}
      />,
    );

    const rangeInput = screen.getByRole('textbox', { name: 'Page range' });
    await user.clear(rangeInput);
    await user.type(rangeInput, '3');
    await user.click(screen.getByRole('button', { name: 'Apply Range' }));

    expect(screen.getByText('Page "3" is outside this PDF.')).toBeTruthy();
    expect(onDownload).not.toHaveBeenCalled();
  });

  it('opens save/download usage docs from the dialog header', async () => {
    const user = userEvent.setup();
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    window.open = openSpy as unknown as typeof window.open;

    render(
      <DownloadPagesDialog
        open
        pageCount={2}
        currentPage={1}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Usage Docs' }));

    expect(openSpy).toHaveBeenCalledWith('/es/usage-docs/save-download-profile', '_blank', 'noopener,noreferrer');
  });
});
