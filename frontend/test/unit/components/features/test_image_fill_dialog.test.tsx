import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ImageFillDialog from '../../../../src/components/features/ImageFillDialog';

describe('ImageFillDialog', () => {
  it('opens image-fill usage docs in a new window from the dialog header', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <ImageFillDialog
        open
        onClose={vi.fn()}
        files={[]}
        extractedFields={[]}
        loading={false}
        error={null}
        creditEstimate={{ imageCount: 0, imageCredits: 0, docCount: 0, docCredits: 0, totalCredits: 0 }}
        onAddFiles={vi.fn()}
        onRemoveFile={vi.fn()}
        onRunExtraction={vi.fn()}
        onUpdateFieldValue={vi.fn()}
        onRejectField={vi.fn()}
        onApplyFields={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Usage Docs' }));

    expect(openSpy).toHaveBeenCalledWith('/usage-docs/fill-from-images', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });
});
