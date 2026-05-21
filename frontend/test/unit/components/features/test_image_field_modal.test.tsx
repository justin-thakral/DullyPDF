import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PdfField } from '../../../../src/types';
import { ImageFieldModal } from '../../../../src/components/features/ImageFieldModal';

const IMAGE_FIELD: PdfField = {
  id: 'image-1',
  name: 'Profile Image',
  type: 'image',
  page: 1,
  rect: { x: 10, y: 10, width: 180, height: 120 },
  imageDataUrl: 'data:image/png;base64,abc',
  imageMimeType: 'image/png',
  imageName: 'profile.png',
};

describe('ImageFieldModal', () => {
  it('saves image color scale changes', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ImageFieldModal
        open
        field={IMAGE_FIELD}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByText('Grayscale'));
    await user.click(screen.getByRole('button', { name: 'Save Image Setup' }));

    expect(onSave).toHaveBeenCalledWith('image-1', expect.objectContaining({
      imageColorMode: 'grayscale',
      imageName: 'profile.png',
      value: null,
    }));
    expect(onClose).toHaveBeenCalled();
  });
});
