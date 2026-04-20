import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';

import type { CheckboxRule, PdfField, TextTransformRule } from '../../../../src/types';
import SearchFillModal from '../../../../src/components/features/SearchFillModal';
import { SEARCH_FILL_NO_MATCH_MESSAGE } from '../../../../src/utils/searchFillApply';

function makeField(overrides: Partial<PdfField> & Pick<PdfField, 'id' | 'name' | 'type' | 'page'>): PdfField {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type,
    page: overrides.page,
    rect: { x: 0, y: 0, width: 100, height: 20 },
    ...overrides,
  };
}

function buildProps(overrides: Partial<ComponentProps<typeof SearchFillModal>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    sessionId: 1,
    dataSourceKind: 'csv' as const,
    dataSourceLabel: 'records.csv',
    columns: ['mrn', 'full_name'],
    identifierKey: 'mrn',
    rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
    fields: [] as PdfField[],
    checkboxRules: [] as CheckboxRule[],
    onFieldsChange: vi.fn(),
    onClearFields: vi.fn(),
    onAfterFill: vi.fn(),
    onError: vi.fn(),
    onRequestDataSource: vi.fn(),
    demoSearch: null,
    // Disable crediting by default so existing tests stay focused on
    // application behavior; the structured-fill crediting tests opt back in
    // by setting `structuredFillCreditingEnabled: true` + a templateId.
    structuredFillCreditingEnabled: false as const,
    ...overrides,
  };
}

async function runSearch(query: string) {
  const user = userEvent.setup();
  const queryInput = screen.getByLabelText('Search');
  await user.clear(queryInput);
  await user.type(queryInput, query);
  await user.click(screen.getByRole('button', { name: 'Search' }));
}

describe('SearchFillModal', () => {
  it('renders the shared close button and wires onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<SearchFillModal {...buildProps({ onClose })} />);

    await user.click(screen.getByRole('button', { name: 'Close Search, Fill & Clear dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('validates missing source, rows, query, and search key', async () => {
    const user = userEvent.setup();

    const propsMissingSource = buildProps({
      dataSourceKind: 'none',
      dataSourceLabel: null,
      rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
    });
    const { rerender } = render(<SearchFillModal {...propsMissingSource} />);
    await runSearch('ada');
    expect(screen.getByText('Choose a CSV, Excel, JSON, or respondent source first.')).toBeTruthy();

    const propsMissingRows = buildProps({
      rows: [],
      demoSearch: {
        query: 'ada',
        searchKey: 'mrn',
        searchMode: 'contains',
        autoRun: true,
        token: 12,
      },
    });
    rerender(<SearchFillModal {...propsMissingRows} />);
    await waitFor(() => {
      expect(screen.getByText('No record rows are available to search.')).toBeTruthy();
    });

    const propsMissingQuery = buildProps({
      rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
    });
    rerender(<SearchFillModal {...propsMissingQuery} />);
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('Enter a search value.')).toBeTruthy();

    const propsMissingSearchKey = buildProps({
      columns: [],
      identifierKey: null,
      rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
    });
    rerender(<SearchFillModal {...propsMissingSearchKey} />);
    await runSearch('ada');
    expect(screen.getByText('Choose a column to search.')).toBeTruthy();
  });

  it('supports contains/equals search, any-column mode, and result limits', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 30 }, (_, index) => ({
      mrn: `${index + 1}`,
      full_name: `Alex ${index + 1}`,
      city: index % 2 === 0 ? 'Austin' : 'Boston',
    }));
    const props = buildProps({
      columns: ['mrn', 'full_name', 'city'],
      identifierKey: 'mrn',
      rows,
    });
    render(<SearchFillModal {...props} />);

    await user.selectOptions(screen.getByLabelText('Column'), '__any__');
    await runSearch('alex');

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Fill PDF' })).toHaveLength(25);
    });

    await user.selectOptions(screen.getByLabelText('Match'), 'equals');
    await user.selectOptions(screen.getByLabelText('Column'), 'full_name');
    await runSearch('alex 7');

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Fill PDF' })).toHaveLength(1);
      expect(screen.getByText('7 • Alex 7')).toBeTruthy();
    });
  });

  it('renders row preview content and wires Fill PDF action callbacks', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const onAfterFill = vi.fn();
    const onClose = vi.fn();
    const fields = [
      makeField({ id: 'full-name', name: 'full_name', type: 'text', page: 1 }),
    ];
    const props = buildProps({
      rows: [
        {
          mrn: '12345',
          full_name: 'Grace Hopper',
          dob: '1906-12-09',
          phone: '+1-555-1000',
          email: 'grace@example.com',
        },
      ],
      fields,
      onFieldsChange,
      onAfterFill,
      onClose,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('12345');
    expect(screen.getByText('12345 • Grace Hopper')).toBeTruthy();
    expect(screen.getByText('DOB 1906-12-09 • +1-555-1000 • grace@example.com')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
      expect(onAfterFill).toHaveBeenCalledWith({
        row: {
          mrn: '12345',
          full_name: 'Grace Hopper',
          dob: '1906-12-09',
          phone: '+1-555-1000',
          email: 'grace@example.com',
        },
        dataSourceKind: 'csv',
        structuredFillCommit: null,
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the dialog open when the selected record does not match any PDF field names', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const onAfterFill = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();

    render(
      <SearchFillModal
        {...buildProps({
          fields: [
            makeField({ id: 'legacy-name', name: 'commonforms_text_p1_1', type: 'text', page: 1 }),
          ],
          onFieldsChange,
          onAfterFill,
          onClose,
          onError,
        })}
      />,
    );

    await runSearch('001');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    expect(screen.getByText(SEARCH_FILL_NO_MATCH_MESSAGE)).toBeTruthy();
    expect(onFieldsChange).not.toHaveBeenCalled();
    expect(onAfterFill).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(screen.getByText('001 • Ada Lovelace')).toBeTruthy();
  });

  it('defaults a group context to "fill all forms" and submits every target on fill', async () => {
    const user = userEvent.setup();
    const onFillTargets = vi.fn();
    const onAfterFill = vi.fn();
    const onClose = vi.fn();

    render(
      <SearchFillModal
        {...buildProps({
          rows: [{ mrn: '100', full_name: 'Ada Lovelace' }],
          fillTargets: [
            { id: 'tpl-a', name: 'Admissions Packet' },
            { id: 'tpl-b', name: 'Consent Form' },
          ],
          activeFillTargetId: 'tpl-a',
          onFillTargets,
          onAfterFill,
          onClose,
        })}
      />,
    );

    // The "Apply to all forms in this group" master checkbox is on by default
    // and the per-target picker is hidden in favor of a summary line.
    const masterToggle = screen.getByRole('checkbox', { name: /apply to all forms in this group/i });
    expect((masterToggle as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Will fill all 2 PDFs in this group from the selected row.')).toBeTruthy();
    expect(screen.queryByText('Select which PDFs receive the row')).toBeNull();

    await runSearch('100');
    await user.click(screen.getByRole('button', { name: 'Fill all 2 PDFs' }));

    await waitFor(() => {
      expect(onFillTargets).toHaveBeenCalledWith(
        { mrn: '100', full_name: 'Ada Lovelace' },
        ['tpl-a', 'tpl-b'],
      );
      expect(onAfterFill).toHaveBeenCalledWith({
        row: { mrn: '100', full_name: 'Ada Lovelace' },
        dataSourceKind: 'csv',
        structuredFillCommit: null,
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('reveals the per-target picker when the master "fill all" checkbox is unchecked', async () => {
    const user = userEvent.setup();
    const onFillTargets = vi.fn();
    const onAfterFill = vi.fn();
    const onClose = vi.fn();

    render(
      <SearchFillModal
        {...buildProps({
          rows: [{ mrn: '100', full_name: 'Ada Lovelace' }],
          fillTargets: [
            { id: 'tpl-a', name: 'Admissions Packet' },
            { id: 'tpl-b', name: 'Consent Form' },
            { id: 'tpl-c', name: 'Financial Disclosure' },
          ],
          activeFillTargetId: 'tpl-a',
          onFillTargets,
          onAfterFill,
          onClose,
        })}
      />,
    );

    // Master toggle starts ON (all 3 selected, picker hidden).
    expect(screen.queryByText('Select which PDFs receive the row')).toBeNull();

    // Toggle the master checkbox OFF — picker reveals and only the active
    // template is preselected (back to the single-target default behavior).
    const masterToggle = screen.getByRole('checkbox', { name: /apply to all forms in this group/i });
    await user.click(masterToggle);
    expect((masterToggle as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Select which PDFs receive the row')).toBeTruthy();
    expect(screen.getByText('1 PDF selected')).toBeTruthy();

    // Manually pick a second target and run the fill.
    const consentCheckbox = within(screen.getByText('Consent Form').closest('label') as HTMLElement)
      .getByRole('checkbox');
    await user.click(consentCheckbox);
    expect(screen.getByText('2 PDFs selected')).toBeTruthy();

    await runSearch('100');
    await user.click(screen.getByRole('button', { name: 'Fill selected PDFs' }));

    await waitFor(() => {
      expect(onFillTargets).toHaveBeenCalledWith(
        { mrn: '100', full_name: 'Ada Lovelace' },
        ['tpl-a', 'tpl-b'],
      );
    });
  });

  it('toggling the master checkbox back ON reselects every target in the group', async () => {
    const user = userEvent.setup();
    render(
      <SearchFillModal
        {...buildProps({
          rows: [{ mrn: '100', full_name: 'Ada Lovelace' }],
          fillTargets: [
            { id: 'tpl-a', name: 'Admissions Packet' },
            { id: 'tpl-b', name: 'Consent Form' },
          ],
          activeFillTargetId: 'tpl-a',
          onFillTargets: vi.fn(),
        })}
      />,
    );

    const masterToggle = screen.getByRole('checkbox', { name: /apply to all forms in this group/i });
    await user.click(masterToggle); // off → picker visible
    expect(screen.getByText('1 PDF selected')).toBeTruthy();
    await user.click(masterToggle); // back on
    expect((masterToggle as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText('Select which PDFs receive the row')).toBeNull();
    expect(screen.getByText('Will fill all 2 PDFs in this group from the selected row.')).toBeTruthy();
  });

  it('preserves the live search query and results when the active group target changes', async () => {
    const props = buildProps({
      rows: [{ mrn: '100', full_name: 'Ada Lovelace' }],
      fillTargets: [
        { id: 'tpl-a', name: 'Admissions Packet' },
        { id: 'tpl-b', name: 'Consent Form' },
      ],
      activeFillTargetId: 'tpl-a',
      onFillTargets: vi.fn(),
    });
    const { rerender } = render(<SearchFillModal {...props} />);

    expect(screen.getByText('Will fill all 2 PDFs in this group from the selected row.')).toBeTruthy();

    await runSearch('100');
    expect(screen.getByText('100 • Ada Lovelace')).toBeTruthy();

    rerender(<SearchFillModal {...props} activeFillTargetId="tpl-b" />);

    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('100');
    expect(screen.getByText('100 • Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Will fill all 2 PDFs in this group from the selected row.')).toBeTruthy();
  });

  it('drops removed group targets without clearing the current search session', async () => {
    const props = buildProps({
      rows: [{ mrn: '100', full_name: 'Ada Lovelace' }],
      fillTargets: [
        { id: 'tpl-a', name: 'Admissions Packet' },
        { id: 'tpl-b', name: 'Consent Form' },
      ],
      activeFillTargetId: 'tpl-a',
      onFillTargets: vi.fn(),
    });
    const { rerender } = render(<SearchFillModal {...props} />);

    expect(screen.getByText('Will fill all 2 PDFs in this group from the selected row.')).toBeTruthy();

    await runSearch('100');
    expect(screen.getByText('100 • Ada Lovelace')).toBeTruthy();

    rerender(
      <SearchFillModal
        {...props}
        fillTargets={[{ id: 'tpl-a', name: 'Admissions Packet' }]}
      />,
    );

    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('100');
    expect(screen.getByText('100 • Ada Lovelace')).toBeTruthy();
    // Single-target context — no master checkbox, no per-target picker.
    expect(screen.queryByRole('checkbox', { name: /apply to all forms in this group/i })).toBeNull();
    expect(screen.queryByText('Select which PDFs receive the row')).toBeNull();
    expect(screen.getByRole('button', { name: 'Fill PDF' })).toBeTruthy();
  });

  it('clears stale field values before applying a respondent record', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'full-name', name: 'full_name', type: 'text', page: 1, value: 'Justin Thakral' }),
      makeField({ id: 'member-id', name: 'member_id', type: 'text', page: 1, value: 'OLD-1' }),
    ];
    const props = buildProps({
      dataSourceKind: 'respondent',
      dataSourceLabel: 'Fill By Link respondents',
      columns: ['respondent_label', 'member_id'],
      identifierKey: 'respondent_label',
      rows: [{ respondent_label: 'Ada Lovelace', member_id: 'NEW-42' }],
      fields,
      onFieldsChange,
    });

    render(<SearchFillModal {...props} />);

    await runSearch('Ada');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    const byId = new Map(nextFields.map((field) => [field.id, field.value]));
    expect(byId.get('full-name')).toBeNull();
    expect(byId.get('member-id')).toBe('NEW-42');
  });

  it('fills text/date fields using direct and fallback key heuristics', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'name', name: 'name', type: 'text', page: 1 }),
      makeField({ id: 'appointment-date', name: 'appointment_date', type: 'date', page: 1 }),
      makeField({ id: 'city-state-zip', name: 'city_state_zip', type: 'text', page: 1 }),
      makeField({ id: 'phone-one', name: 'phone_1', type: 'text', page: 1 }),
      makeField({ id: 'age', name: 'age', type: 'text', page: 1 }),
    ];
    const props = buildProps({
      columns: ['mrn', 'first_name', 'last_name', 'appointment_date', 'city', 'state', 'zip', 'phone', 'dob', 'date'],
      rows: [
        {
          mrn: '900',
          first_name: 'Ada',
          last_name: 'Lovelace',
          appointment_date: '2025-01-02T15:30:00Z',
          city: 'London',
          state: 'UK',
          zip: '12345',
          phone: '111-222',
          dob: '1990-01-01',
          date: '2024-01-02',
        },
      ],
      fields,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('900');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    const byId = new Map(nextFields.map((field) => [field.id, field]));

    expect(byId.get('name')?.value).toBe('Ada Lovelace');
    expect(byId.get('appointment-date')?.value).toBe('2025-01-02');
    expect(byId.get('city-state-zip')?.value).toBe('London, UK, 12345');
    expect(byId.get('phone-one')?.value).toBe('111-222');
    expect(byId.get('age')?.value).toBe(34);
  });

  it('applies concat text transform rules when direct values are missing', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'full-name', name: 'full_name', type: 'text', page: 1 }),
    ];
    const textTransformRules: TextTransformRule[] = [
      {
        targetField: 'full_name',
        operation: 'concat',
        sources: ['first_name', 'last_name'],
        separator: ' ',
        confidence: 0.92,
      },
    ];

    const props = buildProps({
      columns: ['mrn', 'first_name', 'last_name'],
      rows: [{ mrn: '910', first_name: 'Ada', last_name: 'Lovelace' }],
      fields,
      textTransformRules,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('910');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    expect(nextFields[0]?.value).toBe('Ada Lovelace');
  });

  it('applies split_name_first_rest rules from full_name into first/last fields', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'first-name', name: 'first_name', type: 'text', page: 1 }),
      makeField({ id: 'last-name', name: 'last_name', type: 'text', page: 1 }),
    ];
    const textTransformRules: TextTransformRule[] = [
      {
        targetField: 'first_name',
        operation: 'split_name_first_rest',
        sources: ['full_name'],
        part: 'first',
        confidence: 0.88,
      },
      {
        targetField: 'last_name',
        operation: 'split_name_first_rest',
        sources: ['full_name'],
        part: 'rest',
        confidence: 0.88,
      },
    ];

    const props = buildProps({
      columns: ['mrn', 'full_name'],
      rows: [{ mrn: '911', full_name: 'Mary Ann Smith' }],
      fields,
      textTransformRules,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('911');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    const byId = new Map(nextFields.map((field) => [field.id, field]));
    expect(byId.get('first-name')?.value).toBe('Mary');
    expect(byId.get('last-name')?.value).toBe('Ann Smith');
  });

  it('prefers direct row values over text transform rules for the same target field', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'first-name', name: 'first_name', type: 'text', page: 1 }),
    ];
    const textTransformRules: TextTransformRule[] = [
      {
        targetField: 'first_name',
        operation: 'split_name_first_rest',
        sources: ['full_name'],
        part: 'first',
        confidence: 0.95,
      },
    ];

    const props = buildProps({
      columns: ['mrn', 'first_name', 'full_name'],
      rows: [{ mrn: '912', first_name: 'Direct', full_name: 'Derived Value' }],
      fields,
      textTransformRules,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('912');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    expect(nextFields[0]?.value).toBe('Direct');
  });

  it('normalizes slash-delimited YYYY/MM/DD values for date fields', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'appointment-date', name: 'appointment_date', type: 'date', page: 1 }),
    ];
    const props = buildProps({
      columns: ['mrn', 'appointment_date'],
      rows: [
        {
          mrn: '901',
          appointment_date: '2025/01/02',
        },
      ],
      fields,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('901');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    expect(nextFields[0]?.value).toBe('2025-01-02');
  });

  it('applies checkbox values from direct keys, aliases, and rules with deterministic conflict resolution', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'allergies_yes', name: 'allergies_yes', type: 'checkbox', page: 1 }),
      makeField({ id: 'allergies_no', name: 'allergies_no', type: 'checkbox', page: 1 }),
      makeField({ id: 'pregnant_yes', name: 'pregnant_yes', type: 'checkbox', page: 1 }),
      makeField({ id: 'pregnant_no', name: 'pregnant_no', type: 'checkbox', page: 1 }),
      makeField({ id: 'drug_use_yes', name: 'drug_use_yes', type: 'checkbox', page: 1 }),
      makeField({ id: 'drug_use_no', name: 'drug_use_no', type: 'checkbox', page: 1 }),
      makeField({ id: 'marketing', name: 'i_marketing_opt_in', type: 'checkbox', page: 1 }),
    ];
    const checkboxRules: CheckboxRule[] = [
      {
        databaseField: 'drug_status',
        groupKey: 'drug_use',
        operation: 'enum',
        valueMap: {
          reported: 'yes',
          none: 'no',
        },
      },
    ];

    const props = buildProps({
      columns: [
        'mrn',
        'has_allergies',
        'pregnancy_status',
        'drug_status',
        'i_drug_use_no',
        'i_marketing_opt_in',
      ],
      rows: [
        {
          mrn: '777',
          has_allergies: 'yes',
          pregnancy_status: 'no',
          drug_status: 'reported',
          i_drug_use_no: 'true',
          i_marketing_opt_in: 'true',
        },
      ],
      fields,
      checkboxRules,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('777');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    const valueById = new Map(nextFields.map((field) => [field.id, field.value]));

    expect(valueById.get('allergies_yes')).toBe(true);
    expect(valueById.get('allergies_no')).toBe(false);
    expect(valueById.get('pregnant_yes')).toBe(false);
    expect(valueById.get('pregnant_no')).toBe(true);
    expect(valueById.get('drug_use_yes')).toBeUndefined();
    expect(valueById.get('drug_use_no')).toBe(true);
    expect(valueById.get('marketing')).toBe(true);
  });

  it('wires clear-input and close interactions without card-click propagation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onClearFields = vi.fn();
    const props = buildProps({
      fields: [
        makeField({ id: 'filled', name: 'full_name', type: 'text', page: 1, value: 'existing' }),
      ],
      onClose,
      onClearFields,
    });
    render(<SearchFillModal {...props} />);

    await user.click(screen.getByRole('button', { name: 'Clear inputs' }));
    expect(onClearFields).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText('Search, Fill & Clear'));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Close Search, Fill & Clear dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(2);

    const resultsRegion = screen.getByLabelText('Search results');
    expect(within(resultsRegion).getByText('No results yet.')).toBeTruthy();
    expect(document.body.querySelector('.ui-dialog-backdrop')).toBeTruthy();
    expect(document.body.querySelector('.searchfill-modal__card')).toBeTruthy();
  });

  it('applies multiple checkbox rules targeting different options in the same group', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'allergy_penicillin', name: 'allergies_penicillin', type: 'checkbox', page: 1 }),
      makeField({ id: 'allergy_shellfish', name: 'allergies_shellfish', type: 'checkbox', page: 1 }),
      makeField({ id: 'allergy_latex', name: 'allergies_latex', type: 'checkbox', page: 1 }),
    ];
    const checkboxRules: CheckboxRule[] = [
      {
        databaseField: 'has_penicillin_allergy',
        groupKey: 'allergies',
        operation: 'yes_no',
        trueOption: 'penicillin',
      },
      {
        databaseField: 'has_shellfish_allergy',
        groupKey: 'allergies',
        operation: 'yes_no',
        trueOption: 'shellfish',
      },
    ];
    const props = buildProps({
      columns: ['mrn', 'has_penicillin_allergy', 'has_shellfish_allergy'],
      rows: [
        {
          mrn: '500',
          has_penicillin_allergy: 'yes',
          has_shellfish_allergy: 'yes',
        },
      ],
      fields,
      checkboxRules,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('500');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    const valueById = new Map(nextFields.map((field) => [field.id, field.value]));

    expect(valueById.get('allergy_penicillin')).toBe(true);
    expect(valueById.get('allergy_shellfish')).toBe(true);
    expect(valueById.get('allergy_latex')).toBe(false);
  });

  it('applies checkbox rules when row values only exist under patient_ prefixed keys', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'smoker_yes', name: 'smoker_yes', type: 'checkbox', page: 1 }),
      makeField({ id: 'smoker_no', name: 'smoker_no', type: 'checkbox', page: 1 }),
    ];
    const checkboxRules: CheckboxRule[] = [
      {
        databaseField: 'smoker_status',
        groupKey: 'smoker',
        operation: 'enum',
        valueMap: {
          current: 'yes',
          never: 'no',
        },
      },
    ];

    const props = buildProps({
      columns: ['mrn', 'patient_smoker_status'],
      rows: [{ mrn: '601', patient_smoker_status: 'current' }],
      fields,
      checkboxRules,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('601');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    const valueById = new Map(nextFields.map((field) => [field.id, field.value]));

    expect(valueById.get('smoker_yes')).toBe(true);
    expect(valueById.get('smoker_no')).toBe(false);
  });

  it('normalizes compact enum values against spaced valueMap keys for checkbox rules', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'drug_yes', name: 'drug_use_yes', type: 'checkbox', page: 1 }),
      makeField({ id: 'drug_no', name: 'drug_use_no', type: 'checkbox', page: 1 }),
    ];
    const checkboxRules: CheckboxRule[] = [
      {
        databaseField: 'drug_status',
        groupKey: 'drug_use',
        operation: 'enum',
        valueMap: {
          'no reported': 'no',
        },
      },
    ];

    const props = buildProps({
      columns: ['mrn', 'drug_status'],
      rows: [{ mrn: '602', drug_status: 'NoReported' }],
      fields,
      checkboxRules,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('602');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    const valueById = new Map(nextFields.map((field) => [field.id, field.value]));

    expect(valueById.get('drug_yes')).toBe(false);
    expect(valueById.get('drug_no')).toBe(true);
  });

  it('does not crash when a row value is an invalid Date object', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const fields = [
      makeField({ id: 'notes', name: 'notes', type: 'text', page: 1 }),
      makeField({ id: 'valid-field', name: 'full_name', type: 'text', page: 1 }),
    ];
    const props = buildProps({
      columns: ['mrn', 'notes', 'full_name'],
      rows: [
        {
          mrn: '999',
          notes: new Date(NaN),
          full_name: 'Valid Name',
        },
      ],
      fields,
      onFieldsChange,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('999');
    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
    });
    const nextFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    const byId = new Map(nextFields.map((field) => [field.id, field]));

    expect(byId.get('notes')?.value).toBeNull();
    expect(byId.get('valid-field')?.value).toBe('Valid Name');
  });

  it('searches and fills from SQL data source kind', async () => {
    const user = userEvent.setup();
    const onFieldsChange = vi.fn();
    const onAfterFill = vi.fn();
    const onClose = vi.fn();
    const fields = [
      makeField({ id: 'name', name: 'patient_name', type: 'text', page: 1 }),
      makeField({ id: 'city', name: 'patient_city', type: 'text', page: 1 }),
      makeField({ id: 'med', name: 'medication_1', type: 'text', page: 2 }),
    ];
    const props = buildProps({
      dataSourceKind: 'sql',
      dataSourceLabel: 'SQL: new_patient_forms_mock.sql',
      columns: ['patient_name', 'patient_city', 'medication_1'],
      identifierKey: 'patient_name',
      rows: [
        { patient_name: 'Justin Thakral', patient_city: 'San Francisco', medication_1: 'Lisinopril 10mg' },
      ],
      fields,
      onFieldsChange,
      onAfterFill,
      onClose,
    });
    render(<SearchFillModal {...props} />);

    await runSearch('Justin');
    expect(screen.getByText('Justin Thakral')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

    await waitFor(() => {
      expect(onFieldsChange).toHaveBeenCalledTimes(1);
      expect(onAfterFill).toHaveBeenCalledWith({
        row: { patient_name: 'Justin Thakral', patient_city: 'San Francisco', medication_1: 'Lisinopril 10mg' },
        dataSourceKind: 'sql',
        structuredFillCommit: null,
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    const filledFields = onFieldsChange.mock.calls[0][0] as PdfField[];
    const byId = new Map(filledFields.map((f) => [f.id, f]));
    expect(byId.get('name')?.value).toBe('Justin Thakral');
    expect(byId.get('city')?.value).toBe('San Francisco');
    expect(byId.get('med')?.value).toBe('Lisinopril 10mg');
  });

  it('shows schema-only message for TXT source with no rows', () => {
    render(
      <SearchFillModal
        {...buildProps({
          dataSourceKind: 'txt',
          dataSourceLabel: 'TXT: schema.txt',
          columns: ['patient_name', 'patient_city'],
          identifierKey: 'patient_name',
          rows: [],
        })}
      />,
    );

    expect(
      screen.getByText('The connected source is schema-only (no row data). Upload a CSV, Excel, or JSON file with rows to search and fill.'),
    ).toBeTruthy();
  });

  it('shows schema-only message for SQL source with no INSERT rows', () => {
    render(
      <SearchFillModal
        {...buildProps({
          dataSourceKind: 'sql',
          dataSourceLabel: 'SQL: schema_only.sql',
          columns: ['patient_name'],
          identifierKey: 'patient_name',
          rows: [],
        })}
      />,
    );

    expect(
      screen.getByText('The connected source is schema-only (no row data). Upload a CSV, Excel, or JSON file with rows to search and fill.'),
    ).toBeTruthy();
  });

  describe('structured fill crediting', () => {
    it('commits Search & Fill usage before mutating fields when templateId is provided', async () => {
      const user = userEvent.setup();
      const onFieldsChange = vi.fn();
      const onAfterFill = vi.fn();
      const { ApiService } = await import('../../../../src/services/api');
      const commitSpy = vi
        .spyOn(ApiService, 'commitSearchFillUsage')
        .mockResolvedValue({
          status: 'committed',
          eventId: 'sfe_test_1',
          requestId: 'sf_test',
          countIncrement: 1,
          monthKey: '2026-04',
          currentMonthUsage: 1,
          fillsRemaining: 49,
          monthlyLimit: 50,
        });

      const fields: PdfField[] = [
        makeField({ id: 'name', name: 'full_name', type: 'text', page: 1 }),
      ];
      render(
        <SearchFillModal
          {...buildProps({
            fields,
            rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
            onFieldsChange,
            onAfterFill,
            templateId: 'tpl-1',
            workspaceSavedFormId: 'tpl-1',
            structuredFillCreditingEnabled: true,
          })}
        />,
      );

      await runSearch('001');
      await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

      await waitFor(() => {
        expect(commitSpy).toHaveBeenCalledTimes(1);
        expect(onFieldsChange).toHaveBeenCalledTimes(1);
      });
      // Commit must be called BEFORE the fields are mutated.
      const commitCallOrder = commitSpy.mock.invocationCallOrder[0];
      const fieldsChangeCallOrder = onFieldsChange.mock.invocationCallOrder[0];
      expect(commitCallOrder).toBeLessThan(fieldsChangeCallOrder);

      const commitArg = commitSpy.mock.calls[0][0];
      expect(commitArg.scopeType).toBe('template');
      expect(commitArg.templateId).toBe('tpl-1');
      expect(commitArg.matchedTemplateIds).toEqual(['tpl-1']);
      expect(commitArg.countIncrement).toBe(1);
      expect(commitArg.sourceKind).toBe('csv');

      const afterFillArg = onAfterFill.mock.calls[0][0];
      expect(afterFillArg.structuredFillCommit).toMatchObject({
        eventId: 'sfe_test_1',
        status: 'committed',
        countIncrement: 1,
      });

      commitSpy.mockRestore();
    });

    it('does not mutate fields when commit returns 429', async () => {
      const user = userEvent.setup();
      const onFieldsChange = vi.fn();
      const onAfterFill = vi.fn();
      const onClose = vi.fn();
      const { ApiService } = await import('../../../../src/services/api');
      const { ApiError } = await import('../../../../src/services/apiConfig');
      const commitSpy = vi
        .spyOn(ApiService, 'commitSearchFillUsage')
        .mockRejectedValue(new ApiError('Monthly Search & Fill credit limit reached.', 429, 'structured_fill_limit_reached'));

      const fields: PdfField[] = [
        makeField({ id: 'name', name: 'full_name', type: 'text', page: 1 }),
      ];
      render(
        <SearchFillModal
          {...buildProps({
            fields,
            rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
            onFieldsChange,
            onAfterFill,
            onClose,
            templateId: 'tpl-1',
            structuredFillCreditingEnabled: true,
          })}
        />,
      );

      await runSearch('001');
      await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

      await waitFor(() => {
        expect(commitSpy).toHaveBeenCalledTimes(1);
      });
      expect(onFieldsChange).not.toHaveBeenCalled();
      expect(onAfterFill).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText(/Monthly Search & Fill credit limit reached/i)).toBeTruthy();

      commitSpy.mockRestore();
    });

    it('skips commit entirely when structuredFillCreditingEnabled is false', async () => {
      const user = userEvent.setup();
      const onFieldsChange = vi.fn();
      const { ApiService } = await import('../../../../src/services/api');
      const commitSpy = vi.spyOn(ApiService, 'commitSearchFillUsage').mockResolvedValue({
        status: 'committed',
        eventId: 'should-not-be-called',
        requestId: 'req',
        countIncrement: 1,
        monthKey: '2026-04',
        currentMonthUsage: 0,
        fillsRemaining: 50,
        monthlyLimit: 50,
      });

      const fields: PdfField[] = [
        makeField({ id: 'name', name: 'full_name', type: 'text', page: 1 }),
      ];
      render(
        <SearchFillModal
          {...buildProps({
            fields,
            rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
            onFieldsChange,
            templateId: 'tpl-1',
            structuredFillCreditingEnabled: false,
          })}
        />,
      );

      await runSearch('001');
      await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

      await waitFor(() => {
        expect(onFieldsChange).toHaveBeenCalledTimes(1);
      });
      expect(commitSpy).not.toHaveBeenCalled();

      commitSpy.mockRestore();
    });

    it('refuses to fill an unsaved workspace when crediting is enabled (revenue leak guard)', async () => {
      const user = userEvent.setup();
      const onFieldsChange = vi.fn();
      const { ApiService } = await import('../../../../src/services/api');
      const commitSpy = vi.spyOn(ApiService, 'commitSearchFillUsage');

      const fields: PdfField[] = [
        makeField({ id: 'name', name: 'full_name', type: 'text', page: 1 }),
      ];
      render(
        <SearchFillModal
          {...buildProps({
            fields,
            rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
            onFieldsChange,
            templateId: null, // <- the bug: no saved form
            structuredFillCreditingEnabled: true,
          })}
        />,
      );

      await runSearch('001');
      await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

      await waitFor(() => {
        expect(
          screen.getByText(/Save the form before running Search & Fill/i),
        ).toBeTruthy();
      });
      expect(commitSpy).not.toHaveBeenCalled();
      expect(onFieldsChange).not.toHaveBeenCalled();

      commitSpy.mockRestore();
    });

    it('hashes recordFingerprint instead of sending raw PII', async () => {
      const user = userEvent.setup();
      const { ApiService } = await import('../../../../src/services/api');
      const commitSpy = vi
        .spyOn(ApiService, 'commitSearchFillUsage')
        .mockResolvedValue({
          status: 'committed',
          eventId: 'sfe_hash_test',
          requestId: 'req',
          countIncrement: 1,
          monthKey: '2026-04',
          currentMonthUsage: 1,
          fillsRemaining: 49,
          monthlyLimit: 50,
        });

      const fields: PdfField[] = [
        makeField({ id: 'name', name: 'full_name', type: 'text', page: 1 }),
      ];
      render(
        <SearchFillModal
          {...buildProps({
            fields,
            rows: [{
              mrn: '001',
              full_name: 'Ada Lovelace',
              dob: '1815-12-10',
            }],
            templateId: 'tpl-1',
            structuredFillCreditingEnabled: true,
          })}
        />,
      );

      await runSearch('001');
      await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

      await waitFor(() => {
        expect(commitSpy).toHaveBeenCalledTimes(1);
      });
      const fingerprint = commitSpy.mock.calls[0][0].recordFingerprint;
      expect(fingerprint).toBeTruthy();
      // The fingerprint must NOT contain the raw PII. Both Web Crypto SHA-256
      // (a 64-char hex digest) and the FNV-1a fallback (`fnv1a_<hex>`) pass
      // this check; the legacy "raw identity joined with |" implementation
      // would fail it.
      expect(fingerprint).not.toContain('Ada');
      expect(fingerprint).not.toContain('Lovelace');
      expect(fingerprint).not.toContain('1815');
      const looksHashed =
        /^[0-9a-f]{64}$/i.test(fingerprint as string)
        || /^fnv1a_[0-9a-f]+$/.test(fingerprint as string);
      expect(looksHashed).toBe(true);

      commitSpy.mockRestore();
    });

    it('does not call commit on no-match (preserves the validation error path)', async () => {
      const user = userEvent.setup();
      const onFieldsChange = vi.fn();
      const { ApiService } = await import('../../../../src/services/api');
      const commitSpy = vi.spyOn(ApiService, 'commitSearchFillUsage');

      render(
        <SearchFillModal
          {...buildProps({
            fields: [makeField({ id: 'irrelevant', name: 'irrelevant', type: 'text', page: 1 })],
            rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
            onFieldsChange,
            templateId: 'tpl-1',
            structuredFillCreditingEnabled: true,
          })}
        />,
      );

      await runSearch('001');
      await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

      await waitFor(() => {
        expect(screen.getByText(SEARCH_FILL_NO_MATCH_MESSAGE)).toBeTruthy();
      });
      expect(commitSpy).not.toHaveBeenCalled();
      expect(onFieldsChange).not.toHaveBeenCalled();

      commitSpy.mockRestore();
    });
  });

  describe('credit pool isolation', () => {
    // Fill By Link web-form responses surface as `dataSourceKind='respondent'`.
    // Those fills should never hit the Fill by File credit pool — the response
    // has already been debited against ``fill_link_usage_counters`` when the
    // webform was submitted. The modal must detect this and skip the commit.
    it('does not commit Search & Fill credits for webform respondent fills', async () => {
      const user = userEvent.setup();
      const onFieldsChange = vi.fn();
      const { ApiService } = await import('../../../../src/services/api');
      const commitSpy = vi
        .spyOn(ApiService, 'commitSearchFillUsage')
        .mockResolvedValue({
          status: 'committed',
          eventId: 'should-not-be-called',
          requestId: 'unused',
          countIncrement: 1,
          monthKey: '2026-04',
          currentMonthUsage: 0,
          fillsRemaining: 50,
          monthlyLimit: 50,
        });

      const fields: PdfField[] = [
        makeField({ id: 'name', name: 'full_name', type: 'text', page: 1 }),
      ];
      render(
        <SearchFillModal
          {...buildProps({
            // Webform-backed data source. Credits already accounted for by
            // Fill By Link at submit time.
            dataSourceKind: 'respondent',
            dataSourceLabel: 'Fill By Link respondents',
            fields,
            rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
            onFieldsChange,
            templateId: 'tpl-1',
            structuredFillCreditingEnabled: true,
          })}
        />,
      );

      await runSearch('001');
      await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

      await waitFor(() => {
        expect(onFieldsChange).toHaveBeenCalledTimes(1);
      });
      expect(commitSpy).not.toHaveBeenCalled();

      commitSpy.mockRestore();
    });

    // The header credit pill should also hide itself when the source kind
    // is not chargeable so users don't get a confusing "Will use 1 credit"
    // preview for a fill that isn't charged.
    it('hides the "Will use N credit" pill for respondent data sources', () => {
      render(
        <SearchFillModal
          {...buildProps({
            dataSourceKind: 'respondent',
            dataSourceLabel: 'Fill By Link respondents',
            templateId: 'tpl-1',
            structuredFillCreditingEnabled: true,
          })}
        />,
      );
      expect(screen.queryByText(/Will use.*credit/i)).toBeNull();
    });

    // ``dataSourceKind='none'`` (nothing connected) must also bypass the
    // commit path so opening and closing the modal without selecting a
    // source never writes a structured-fill event.
    it('does not commit Search & Fill credits when no data source is selected', async () => {
      const { ApiService } = await import('../../../../src/services/api');
      const commitSpy = vi.spyOn(ApiService, 'commitSearchFillUsage');

      render(
        <SearchFillModal
          {...buildProps({
            dataSourceKind: 'none',
            dataSourceLabel: null,
            rows: [],
            templateId: 'tpl-1',
            structuredFillCreditingEnabled: true,
          })}
        />,
      );

      // No interactions — just assert the network was never touched.
      expect(commitSpy).not.toHaveBeenCalled();

      commitSpy.mockRestore();
    });

    // Each of the five documented structured source kinds must trigger
    // exactly one commit on a successful fill — an easy regression guard
    // against someone accidentally gating the path on one specific kind.
    it.each(['csv', 'excel', 'sql', 'json'] as const)(
      'commits exactly once for the %s source kind',
      async (sourceKind) => {
        const user = userEvent.setup();
        const { ApiService } = await import('../../../../src/services/api');
        const commitSpy = vi
          .spyOn(ApiService, 'commitSearchFillUsage')
          .mockResolvedValue({
            status: 'committed',
            eventId: `sfe_${sourceKind}`,
            requestId: `req_${sourceKind}`,
            countIncrement: 1,
            monthKey: '2026-04',
            currentMonthUsage: 1,
            fillsRemaining: 49,
            monthlyLimit: 50,
          });

        const fields: PdfField[] = [
          makeField({ id: 'name', name: 'full_name', type: 'text', page: 1 }),
        ];
        render(
          <SearchFillModal
            {...buildProps({
              dataSourceKind: sourceKind,
              dataSourceLabel: `${sourceKind.toUpperCase()}: sample`,
              fields,
              rows: [{ mrn: '001', full_name: 'Ada Lovelace' }],
              templateId: 'tpl-1',
              structuredFillCreditingEnabled: true,
            })}
          />,
        );

        await runSearch('001');
        await user.click(screen.getByRole('button', { name: 'Fill PDF' }));

        await waitFor(() => {
          expect(commitSpy).toHaveBeenCalledTimes(1);
        });
        expect(commitSpy.mock.calls[0][0].sourceKind).toBe(sourceKind);

        commitSpy.mockRestore();
      },
    );
  });
});
