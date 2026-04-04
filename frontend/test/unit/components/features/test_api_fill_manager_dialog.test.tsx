import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiFillManagerDialog from '../../../../src/components/features/ApiFillManagerDialog';
import type { ApiFillManagerDialogProps } from '../../../../src/hooks/useWorkspaceTemplateApi';

let clipboardWriteText: ReturnType<typeof vi.fn>;

function createProps(overrides: Partial<ApiFillManagerDialogProps> = {}): ApiFillManagerDialogProps {
  return {
    open: true,
    onClose: vi.fn(),
    templateName: 'Patient Intake',
    hasActiveTemplate: true,
    endpoint: null,
    schema: null,
    limits: null,
    recentEvents: [],
    loading: false,
    publishing: false,
    rotating: false,
    revoking: false,
    error: null,
    latestSecret: null,
    onPublish: vi.fn().mockResolvedValue(undefined),
    onRotate: vi.fn().mockResolvedValue(undefined),
    onRevoke: vi.fn().mockResolvedValue(undefined),
    onRefresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('ApiFillManagerDialog', () => {
  beforeEach(() => {
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    });
  });

  it('publishes with the selected export mode', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn().mockResolvedValue(undefined);

    render(<ApiFillManagerDialog {...createProps({ onPublish })} />);

    await user.click(screen.getByRole('button', { name: /Editable PDF/i }));
    await user.click(screen.getByRole('button', { name: 'Generate key' }));

    expect(onPublish).toHaveBeenCalledWith('editable');
  });

  it('opens API Fill usage docs in a new window from the dialog header', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<ApiFillManagerDialog {...createProps()} />);

    await user.click(screen.getByRole('button', { name: 'Usage Docs' }));

    expect(openSpy).toHaveBeenCalledWith('/usage-docs/api-fill', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('uses the published schema export mode when republishing an existing endpoint', async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn().mockResolvedValue(undefined);

    render(
      <ApiFillManagerDialog
        {...createProps({
          onPublish,
          endpoint: {
            id: 'tep-1',
            templateId: 'tpl-1',
            templateName: 'Patient Intake',
            status: 'active',
            snapshotVersion: 3,
            keyPrefix: 'dpa_live_abc123',
            createdAt: '2026-03-25T12:00:00.000Z',
            updatedAt: '2026-03-25T12:00:00.000Z',
            publishedAt: '2026-03-25T12:00:00.000Z',
            lastUsedAt: '2026-03-25T13:00:00.000Z',
            usageCount: 7,
            fillPath: '/api/v1/fill/tep-1.pdf',
            schemaPath: '/api/template-api-endpoints/tep-1/schema',
          },
          schema: {
            snapshotVersion: 3,
            defaultExportMode: 'editable',
            fields: [{ key: 'full_name', fieldName: 'full_name', type: 'text', page: 1 }],
            checkboxFields: [],
            checkboxGroups: [],
            radioGroups: [],
            exampleData: { full_name: 'Ada Lovelace' },
          },
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Republish snapshot' }));

    expect(onPublish).toHaveBeenCalledWith('editable');
  });

  it('closes from the top-right close control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ApiFillManagerDialog {...createProps({ onClose })} />);

    await user.click(screen.getByRole('button', { name: 'Close API Fill dialog' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows generate key for revoked endpoints because publish creates a new secret', () => {
    render(
      <ApiFillManagerDialog
        {...createProps({
          endpoint: {
            id: 'tep-1',
            templateId: 'tpl-1',
            templateName: 'Patient Intake',
            status: 'revoked',
            snapshotVersion: 3,
            keyPrefix: 'dpa_live_abc123',
            createdAt: '2026-03-25T12:00:00.000Z',
            updatedAt: '2026-03-25T12:00:00.000Z',
            publishedAt: '2026-03-25T12:00:00.000Z',
            lastUsedAt: '2026-03-25T13:00:00.000Z',
            usageCount: 7,
            fillPath: '/api/v1/fill/tep-1.pdf',
            schemaPath: '/api/template-api-endpoints/tep-1/schema',
          },
          schema: {
            snapshotVersion: 3,
            defaultExportMode: 'flat',
            fields: [{ key: 'full_name', fieldName: 'full_name', type: 'text', page: 1 }],
            checkboxFields: [],
            checkboxGroups: [],
            radioGroups: [],
            exampleData: { full_name: 'Ada Lovelace' },
          },
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Generate key' })).toBeTruthy();
    expect(screen.getByText(/This endpoint is revoked\./)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy URL' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy schema URL' })).toBeNull();
    expect(screen.queryByLabelText('Example language')).toBeNull();
  });

  it('renders a selectable example area and a payload file template', async () => {
    const user = userEvent.setup();

    render(
      <ApiFillManagerDialog
        {...createProps({
          endpoint: {
            id: 'tep-1',
            templateId: 'tpl-1',
            templateName: 'Patient Intake',
            status: 'active',
            snapshotVersion: 3,
            keyPrefix: 'dpa_live_abc123',
            createdAt: '2026-03-25T12:00:00.000Z',
            updatedAt: '2026-03-25T12:00:00.000Z',
            publishedAt: '2026-03-25T12:00:00.000Z',
            lastUsedAt: '2026-03-25T13:00:00.000Z',
            usageCount: 7,
            fillPath: '/api/v1/fill/tep-1.pdf',
            schemaPath: '/api/template-api-endpoints/tep-1/schema',
          },
          schema: {
            snapshotVersion: 3,
            defaultExportMode: 'editable',
            fields: [{ key: 'full_name', fieldName: 'full_name', type: 'text', page: 1 }],
            checkboxFields: [],
            checkboxGroups: [],
            radioGroups: [],
            exampleData: { full_name: 'Ada Lovelace' },
          },
        })}
      />,
    );

    expect(screen.getByText(/Save the request template below as/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy payload file' })).toBeTruthy();
    expect(screen.getByText(/"exportMode": "editable"/)).toBeTruthy();
    expect(screen.getByText(/"strict": true/)).toBeTruthy();
    expect(screen.getByText(/--data "@\.\/payload\.json"/)).toBeTruthy();
    expect(screen.getByText(/--output "\.\/filled\.pdf"/)).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Example language'), 'node');
    expect(screen.getByText(/const payloadPath = "\.\/payload\.json";/)).toBeTruthy();
    expect(screen.getByText(/await writeFile\("\.\/filled\.pdf", pdf\);/)).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Example language'), 'python');
    expect(screen.getByText(/payload_path = "\.\/payload\.json"/)).toBeTruthy();
    expect(screen.getByText(/with open\("\.\/filled\.pdf", 'wb'\) as output_file:/)).toBeTruthy();
  });

  it('includes runtime failures in the tracked failure count', () => {
    render(
      <ApiFillManagerDialog
        {...createProps({
          endpoint: {
            id: 'tep-1',
            templateId: 'tpl-1',
            templateName: 'Patient Intake',
            status: 'active',
            snapshotVersion: 3,
            keyPrefix: 'dpa_live_abc123',
            createdAt: '2026-03-25T12:00:00.000Z',
            updatedAt: '2026-03-25T12:00:00.000Z',
            publishedAt: '2026-03-25T12:00:00.000Z',
            lastUsedAt: '2026-03-25T13:00:00.000Z',
            usageCount: 7,
            authFailureCount: 1,
            validationFailureCount: 2,
            runtimeFailureCount: 3,
            suspiciousFailureCount: 4,
            fillPath: '/api/v1/fill/tep-1.pdf',
            schemaPath: '/api/template-api-endpoints/tep-1/schema',
          },
          schema: {
            snapshotVersion: 3,
            defaultExportMode: 'flat',
            fields: [{ key: 'full_name', fieldName: 'full_name', type: 'text', page: 1 }],
            checkboxFields: [],
            checkboxGroups: [],
            radioGroups: [],
            exampleData: { full_name: 'Ada Lovelace' },
          },
          limits: {
            activeEndpointsMax: 3,
            activeEndpointsUsed: 1,
            requestsPerMonthMax: 250,
            requestsThisMonth: 7,
            requestUsageMonth: '2026-03',
            maxPagesPerRequest: 25,
            templatePageCount: 1,
          },
        })}
      />,
    );

    expect(screen.getByText('6 tracked failures')).toBeTruthy();
  });

  it('renders endpoint metadata, schema counts, and one-time secret details', () => {
    render(
      <ApiFillManagerDialog
        {...createProps({
          endpoint: {
            id: 'tep-1',
            templateId: 'tpl-1',
            templateName: 'Patient Intake',
            status: 'active',
            snapshotVersion: 3,
            keyPrefix: 'dpa_live_abc123',
            createdAt: '2026-03-25T12:00:00.000Z',
            updatedAt: '2026-03-25T12:00:00.000Z',
            publishedAt: '2026-03-25T12:00:00.000Z',
            lastUsedAt: '2026-03-25T13:00:00.000Z',
            usageCount: 7,
            fillPath: '/api/v1/fill/tep-1.pdf',
            schemaPath: '/api/template-api-endpoints/tep-1/schema',
          },
          latestSecret: 'dpa_live_secret',
          schema: {
            snapshotVersion: 3,
            defaultExportMode: 'flat',
            fields: [{ key: 'full_name', fieldName: 'full_name', type: 'text', page: 1 }],
            checkboxFields: [{ key: 'agree_to_terms', fieldName: 'agree_to_terms', type: 'checkbox', page: 1 }],
            checkboxGroups: [
              {
                key: 'consent_signed',
                groupKey: 'consent_group',
                type: 'checkbox_rule',
                operation: 'yes_no',
                options: [{ optionKey: 'yes', optionLabel: 'Yes', fieldName: 'i_consent_yes' }],
                trueOption: 'yes',
                falseOption: 'no',
                valueMap: null,
              },
            ],
            radioGroups: [
              {
                groupKey: 'marital_status',
                type: 'radio',
                options: [{ optionKey: 'single', optionLabel: 'Single' }],
              },
            ],
            exampleData: {
              full_name: '<full_name>',
              agree_to_terms: true,
              consent_signed: true,
              marital_status: 'single',
            },
          },
          limits: {
            activeEndpointsMax: 1,
            activeEndpointsUsed: 1,
            requestsPerMonthMax: 250,
            requestsThisMonth: 7,
            requestUsageMonth: '2026-03',
            maxPagesPerRequest: 25,
            templatePageCount: 2,
          },
          recentEvents: [
            {
              id: 'evt-1',
              eventType: 'rotated',
              outcome: 'success',
              createdAt: '2026-03-25T13:00:00.000Z',
              snapshotVersion: 3,
              summary: 'API key rotated',
              metadata: { keyPrefix: 'dpa_live_abc123' },
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('Shown once')).toBeTruthy();
    expect(screen.getByText('dpa_live_secret')).toBeTruthy();
    expect(screen.getByText('Snapshot version')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Limits and activity')).toBeTruthy();
    expect(screen.getByText('Mar 2026')).toBeTruthy();
    expect(screen.getByText('Recent activity')).toBeTruthy();
    expect(screen.getByText('API key rotated')).toBeTruthy();
    expect(screen.getByText('Scalar fields')).toBeTruthy();
    expect(screen.getByText('Checkbox groups')).toBeTruthy();
    expect(screen.getByText('Radio groups')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy schema URL' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy payload file' })).toBeTruthy();
    expect(screen.getByLabelText('Example language')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy cURL' })).toBeTruthy();
  });

  it('copies the payload file and selected example snippets', async () => {
    const user = userEvent.setup();
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    render(
      <ApiFillManagerDialog
        {...createProps({
          endpoint: {
            id: 'tep-1',
            templateId: 'tpl-1',
            templateName: 'Patient Intake',
            status: 'active',
            snapshotVersion: 3,
            keyPrefix: 'dpa_live_abc123',
            createdAt: '2026-03-25T12:00:00.000Z',
            updatedAt: '2026-03-25T12:00:00.000Z',
            publishedAt: '2026-03-25T12:00:00.000Z',
            lastUsedAt: '2026-03-25T13:00:00.000Z',
            usageCount: 7,
            fillPath: '/api/v1/fill/tep-1.pdf',
            schemaPath: '/api/template-api-endpoints/tep-1/schema',
          },
          schema: {
            snapshotVersion: 3,
            defaultExportMode: 'flat',
            fields: [{ key: 'full_name', fieldName: 'full_name', type: 'text', page: 1 }],
            checkboxFields: [{ key: 'agree_to_terms', fieldName: 'agree_to_terms', type: 'checkbox', page: 1 }],
            checkboxGroups: [],
            radioGroups: [],
            exampleData: {
              full_name: 'Ada Lovelace',
              agree_to_terms: true,
              middle_name: null,
            },
          },
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Copy payload file' }));
    expect(clipboardSpy).toHaveBeenLastCalledWith(expect.stringContaining('"middle_name": null'));
    expect(screen.getByText('Payload file copied.')).toBeTruthy();

    await user.selectOptions(screen.getByLabelText('Example language'), 'python');
    await user.click(screen.getByRole('button', { name: 'Copy Python' }));
    expect(clipboardSpy).toHaveBeenLastCalledWith(expect.stringContaining('payload_path = "./payload.json"'));
    expect(screen.getByText('Python example copied.')).toBeTruthy();
  });

  it('updates the payload preview and copied payload when the selected export mode changes', async () => {
    const user = userEvent.setup();
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    render(
      <ApiFillManagerDialog
        {...createProps({
          endpoint: {
            id: 'tep-1',
            templateId: 'tpl-1',
            templateName: 'Patient Intake',
            status: 'active',
            snapshotVersion: 3,
            keyPrefix: 'dpa_live_abc123',
            createdAt: '2026-03-25T12:00:00.000Z',
            updatedAt: '2026-03-25T12:00:00.000Z',
            publishedAt: '2026-03-25T12:00:00.000Z',
            lastUsedAt: '2026-03-25T13:00:00.000Z',
            usageCount: 7,
            fillPath: '/api/v1/fill/tep-1.pdf',
            schemaPath: '/api/template-api-endpoints/tep-1/schema',
          },
          schema: {
            snapshotVersion: 3,
            defaultExportMode: 'flat',
            fields: [{ key: 'full_name', fieldName: 'full_name', type: 'text', page: 1 }],
            checkboxFields: [],
            checkboxGroups: [],
            radioGroups: [],
            exampleData: { full_name: 'Ada Lovelace' },
          },
        })}
      />,
    );

    expect(screen.getByText(/"exportMode": "flat"/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Editable PDF/i }));
    expect(screen.getByText(/"exportMode": "editable"/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Copy payload file' }));
    expect(clipboardSpy).toHaveBeenLastCalledWith(expect.stringContaining('"exportMode": "editable"'));
  });

  it('clears copy notices when the dialog closes and reopens', async () => {
    const user = userEvent.setup();
    const props = createProps({
      endpoint: {
        id: 'tep-1',
        templateId: 'tpl-1',
        templateName: 'Patient Intake',
        status: 'active',
        snapshotVersion: 3,
        keyPrefix: 'dpa_live_abc123',
        createdAt: '2026-03-25T12:00:00.000Z',
        updatedAt: '2026-03-25T12:00:00.000Z',
        publishedAt: '2026-03-25T12:00:00.000Z',
        lastUsedAt: '2026-03-25T13:00:00.000Z',
        usageCount: 7,
        fillPath: '/api/v1/fill/tep-1.pdf',
        schemaPath: '/api/template-api-endpoints/tep-1/schema',
      },
      schema: {
        snapshotVersion: 3,
        defaultExportMode: 'flat',
        fields: [{ key: 'full_name', fieldName: 'full_name', type: 'text', page: 1 }],
        checkboxFields: [],
        checkboxGroups: [],
        radioGroups: [],
        exampleData: { full_name: 'Ada Lovelace' },
      },
    });
    const { rerender } = render(<ApiFillManagerDialog {...props} />);

    await user.click(screen.getByRole('button', { name: 'Copy payload file' }));
    expect(screen.getByText('Payload file copied.')).toBeTruthy();

    rerender(<ApiFillManagerDialog {...props} open={false} />);
    rerender(<ApiFillManagerDialog {...props} open />);

    expect(screen.queryByText('Payload file copied.')).toBeNull();
  });

  it('truncates the schema preview after 20 fields until expanded while copying the full payload', async () => {
    const user = userEvent.setup();
    const clipboardSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const largeExampleData = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [`field_${index + 1}`, `<field_${index + 1}>`]),
    );

    render(
      <ApiFillManagerDialog
        {...createProps({
          endpoint: {
            id: 'tep-1',
            templateId: 'tpl-1',
            templateName: 'Patient Intake',
            status: 'active',
            snapshotVersion: 3,
            keyPrefix: 'dpa_live_abc123',
            createdAt: '2026-03-25T12:00:00.000Z',
            updatedAt: '2026-03-25T12:00:00.000Z',
            publishedAt: '2026-03-25T12:00:00.000Z',
            lastUsedAt: '2026-03-25T13:00:00.000Z',
            usageCount: 7,
            fillPath: '/api/v1/fill/tep-1.pdf',
            schemaPath: '/api/template-api-endpoints/tep-1/schema',
          },
          schema: {
            snapshotVersion: 3,
            defaultExportMode: 'flat',
            fields: Array.from({ length: 25 }, (_, index) => ({
              key: `field_${index + 1}`,
              fieldName: `field_${index + 1}`,
              type: 'text' as const,
              page: 1,
            })),
            checkboxFields: [],
            checkboxGroups: [],
            radioGroups: [],
            exampleData: largeExampleData,
          },
        })}
      />,
    );

    expect(screen.getByText('Showing 20 of 25 fields in the preview.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show all fields' })).toBeTruthy();
    expect(screen.queryByText(/"field_21": "<field_21>"/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Copy payload file' }));
    expect(clipboardSpy).toHaveBeenLastCalledWith(expect.stringContaining('"field_25": "<field_25>"'));

    await user.click(screen.getByRole('button', { name: 'Show all fields' }));
    expect(screen.getByText('Showing 25 of 25 fields in the preview.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show first 20 fields' })).toBeTruthy();
    expect(screen.getByText(/"field_21": "<field_21>"/)).toBeTruthy();
  });
});
