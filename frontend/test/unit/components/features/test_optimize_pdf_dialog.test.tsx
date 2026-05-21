import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OptimizePdfDialog } from '../../../../src/components/features/OptimizePdfDialog';

describe('OptimizePdfDialog', () => {
  it('shows lossless optimization details and triggers optimize', async () => {
    const user = userEvent.setup();
    const onOptimize = vi.fn();

    render(
      <OptimizePdfDialog
        open
        sourceFileName="packet.pdf"
        sourceFileSize={1536}
        onClose={vi.fn()}
        onOptimize={onOptimize}
      />,
    );

    expect(screen.getByText('Compress / Optimize PDF')).toBeTruthy();
    expect(screen.getByText('1.5 KB')).toBeTruthy();
    expect(screen.getByText('Lossless cleanup')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Optimize PDF' }));

    expect(onOptimize).toHaveBeenCalledTimes(1);
  });
});
