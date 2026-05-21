import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ManagePagesDialog } from '../../../../src/components/features/ManagePagesDialog';

const loadPdfPageCountFromFileMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/utils/pdf', () => ({
  loadPdfPageCountFromFile: loadPdfPageCountFromFileMock,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('ManagePagesDialog', () => {
  beforeEach(() => {
    loadPdfPageCountFromFileMock.mockReset();
  });

  it('builds a current-page payload after delete, rotate, and reorder edits', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <ManagePagesDialog
        open
        pageCount={3}
        currentPage={2}
        sourceFileName="packet.pdf"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    const page1Card = screen.getByText('Page 1').closest('article');
    const page2Card = screen.getByText('Page 2').closest('article');
    const page3Card = screen.getByText('Page 3').closest('article');
    expect(page1Card).toBeTruthy();
    expect(page2Card).toBeTruthy();
    expect(page3Card).toBeTruthy();

    await user.click(within(page2Card as HTMLElement).getByRole('button', { name: 'Rotate' }));
    await user.click(within(page1Card as HTMLElement).getByRole('button', { name: 'Delete' }));
    await user.click(within(page3Card as HTMLElement).getByRole('button', { name: 'Up' }));
    await user.click(screen.getByRole('button', { name: 'Apply Changes' }));

    expect(onApply).toHaveBeenCalledWith({
      finalPages: [
        { source: 'current', page: 3, rotate: 0 },
        { source: 'current', page: 2, rotate: 90 },
      ],
      insertFiles: [],
      currentTransforms: [
        { originalPage: 3, nextPage: 1, rotate: 0 },
        { originalPage: 2, nextPage: 2, rotate: 90 },
      ],
      removedCurrentPages: [1],
    });
  });

  it('stages selected inserted PDF pages at the requested position', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const insertFile = new File(['inserted-pdf'], 'insert.pdf', { type: 'application/pdf' });
    loadPdfPageCountFromFileMock.mockResolvedValue(3);

    render(
      <ManagePagesDialog
        open
        pageCount={2}
        currentPage={1}
        sourceFileName="packet.pdf"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    await user.upload(screen.getByLabelText('PDF file'), insertFile);
    await screen.findByText('insert.pdf (3 pages)');
    await user.clear(screen.getByLabelText('Pages'));
    await user.type(screen.getByLabelText('Pages'), '2-last');
    await user.selectOptions(screen.getByLabelText('Insert position'), 'start');
    await user.click(screen.getByRole('button', { name: 'Stage Insert' }));
    await waitFor(() => expect(screen.getByText('insert.pdf p.2')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Apply Changes' }));

    expect(onApply).toHaveBeenCalledWith({
      finalPages: [
        { source: 'insert', fileIndex: 0, page: 2, rotate: 0 },
        { source: 'insert', fileIndex: 0, page: 3, rotate: 0 },
        { source: 'current', page: 1, rotate: 0 },
        { source: 'current', page: 2, rotate: 0 },
      ],
      insertFiles: [insertFile],
      currentTransforms: [
        { originalPage: 1, nextPage: 3, rotate: 0 },
        { originalPage: 2, nextPage: 4, rotate: 0 },
      ],
      removedCurrentPages: [],
    });
  });

  it('excludes deleted inserted PDF sources and remaps remaining file indexes', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const unusedFile = new File(['unused-pdf'], 'unused.pdf', { type: 'application/pdf' });
    const keptFile = new File(['kept-pdf'], 'kept.pdf', { type: 'application/pdf' });
    loadPdfPageCountFromFileMock.mockResolvedValue(1);

    render(
      <ManagePagesDialog
        open
        pageCount={2}
        currentPage={1}
        sourceFileName="packet.pdf"
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );

    await user.upload(screen.getByLabelText('PDF file'), unusedFile);
    await screen.findByText('unused.pdf (1 page)');
    await user.click(screen.getByRole('button', { name: 'Stage Insert' }));
    const unusedCard = await screen.findByText('unused.pdf p.1');
    await user.click(within(unusedCard.closest('article') as HTMLElement).getByRole('button', { name: 'Delete' }));

    await user.upload(screen.getByLabelText('PDF file'), keptFile);
    await screen.findByText('kept.pdf (1 page)');
    await user.click(screen.getByRole('button', { name: 'Stage Insert' }));
    await screen.findByText('kept.pdf p.1');
    await user.click(screen.getByRole('button', { name: 'Apply Changes' }));

    expect(onApply).toHaveBeenCalledWith({
      finalPages: [
        { source: 'current', page: 1, rotate: 0 },
        { source: 'insert', fileIndex: 0, page: 1, rotate: 0 },
        { source: 'current', page: 2, rotate: 0 },
      ],
      insertFiles: [keptFile],
      currentTransforms: [
        { originalPage: 1, nextPage: 1, rotate: 0 },
        { originalPage: 2, nextPage: 3, rotate: 0 },
      ],
      removedCurrentPages: [],
    });
  });

  it('ignores stale page-count results when inserted PDF selections race', async () => {
    const slowFirstRead = deferred<number>();
    const fastSecondRead = deferred<number>();
    loadPdfPageCountFromFileMock
      .mockReturnValueOnce(slowFirstRead.promise)
      .mockReturnValueOnce(fastSecondRead.promise);

    render(
      <ManagePagesDialog
        open
        pageCount={2}
        currentPage={1}
        sourceFileName="packet.pdf"
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('PDF file');
    fireEvent.change(input, { target: { files: [new File(['first'], 'first.pdf', { type: 'application/pdf' })] } });
    fireEvent.change(input, { target: { files: [new File(['second'], 'second.pdf', { type: 'application/pdf' })] } });

    fastSecondRead.resolve(2);
    await screen.findByText('second.pdf (2 pages)');
    slowFirstRead.resolve(1);

    await waitFor(() => {
      expect(screen.getByText('second.pdf (2 pages)')).toBeTruthy();
      expect(screen.queryByText('second.pdf (1 page)')).toBeNull();
      expect(screen.queryByText('first.pdf (1 page)')).toBeNull();
    });
  });

  it('does not leave insert loading stuck after a newer invalid file selection', async () => {
    const slowFirstRead = deferred<number>();
    loadPdfPageCountFromFileMock.mockReturnValueOnce(slowFirstRead.promise);

    render(
      <ManagePagesDialog
        open
        pageCount={2}
        currentPage={1}
        sourceFileName="packet.pdf"
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('PDF file');
    fireEvent.change(input, { target: { files: [new File(['first'], 'first.pdf', { type: 'application/pdf' })] } });
    expect(screen.getByRole('button', { name: 'Reading PDF...' })).toBeTruthy();

    fireEvent.change(input, { target: { files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })] } });
    expect(screen.getByText('Choose a PDF file to insert pages.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stage Insert' })).toBeTruthy();

    slowFirstRead.resolve(1);
    await waitFor(() => {
      expect(screen.getByText('Choose a PDF file to insert pages.')).toBeTruthy();
      expect(screen.queryByText('first.pdf (1 page)')).toBeNull();
    });
  });
});
