/**
 * Integration tests verifying end-to-end SQL and TXT schema import through
 * the fill pipeline: parse file → extract schema + rows → apply row to
 * PDF fields via applySearchFillRowToFields.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseSql } from '../../../src/utils/sql';
import { parseSchemaText } from '../../../src/utils/schema';
import { applySearchFillRowToFields } from '../../../src/utils/searchFillApply';
import type { PdfField } from '../../../src/types';

const SQL_PATH = resolve(__dirname, '../../../../quickTestFiles/new_patient_forms_mock.sql');

function makeField(
  overrides: Pick<PdfField, 'id' | 'name' | 'type' | 'page'> & Partial<PdfField>,
): PdfField {
  return {
    rect: { x: 0, y: 0, width: 100, height: 20 },
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// SQL: full pipeline from .sql file → parsed rows → field fill
// -----------------------------------------------------------------------
describe('SQL file → Search & Fill integration', () => {
  const sqlText = readFileSync(SQL_PATH, 'utf-8');
  const parsed = parseSql(sqlText);

  it('parses CREATE TABLE + INSERT and produces searchable rows', () => {
    expect(parsed.columns.length).toBe(167);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].patient_name).toBe('Justin Thakral');
  });

  it('fills text fields from SQL-parsed row data', () => {
    const fields: PdfField[] = [
      makeField({ id: 'f1', name: 'patient_name', type: 'text', page: 1 }),
      makeField({ id: 'f2', name: 'patient_city', type: 'text', page: 1 }),
      makeField({ id: 'f3', name: 'patient_email', type: 'text', page: 1 }),
      makeField({ id: 'f4', name: 'employer_name', type: 'text', page: 1 }),
      makeField({ id: 'f5', name: 'dental_insurance_company', type: 'text', page: 1 }),
      makeField({ id: 'f6', name: 'medication_1', type: 'text', page: 2 }),
      makeField({ id: 'f7', name: 'allergy_1', type: 'text', page: 2 }),
    ];

    const filled = applySearchFillRowToFields({
      row: parsed.rows[0],
      fields,
      checkboxRules: [],
      textTransformRules: [],
      dataSourceKind: 'sql',
    });

    expect(filled.find((f) => f.id === 'f1')?.value).toBe('Justin Thakral');
    expect(filled.find((f) => f.id === 'f2')?.value).toBe('San Francisco');
    expect(filled.find((f) => f.id === 'f3')?.value).toBe('justin.thakral@example.com');
    expect(filled.find((f) => f.id === 'f4')?.value).toBe('Thakral Analytics');
    expect(filled.find((f) => f.id === 'f5')?.value).toBe('Bay Dental Coverage');
    expect(filled.find((f) => f.id === 'f6')?.value).toBe('Lisinopril 10mg');
    expect(filled.find((f) => f.id === 'f7')?.value).toBe('Penicillin');
  });

  it('fills date fields from SQL-parsed row data', () => {
    const fields: PdfField[] = [
      makeField({ id: 'd1', name: 'patient_birthdate', type: 'date', page: 1 }),
      makeField({ id: 'd2', name: 'patient_or_guardian_signature_date', type: 'date', page: 2 }),
    ];

    const filled = applySearchFillRowToFields({
      row: parsed.rows[0],
      fields,
      checkboxRules: [],
      textTransformRules: [],
      dataSourceKind: 'sql',
    });

    expect(filled.find((f) => f.id === 'd1')?.value).toBe('1990-02-14');
    expect(filled.find((f) => f.id === 'd2')?.value).toBe('2025-01-15');
  });

  it('fills checkbox fields from SQL-parsed boolean values', () => {
    const fields: PdfField[] = [
      makeField({
        id: 'c1', name: 'i_sex_f', type: 'checkbox', page: 1,
        groupKey: 'sex', optionKey: 'f', optionLabel: 'Female',
      }),
      makeField({
        id: 'c2', name: 'i_sex_m', type: 'checkbox', page: 1,
        groupKey: 'sex', optionKey: 'm', optionLabel: 'Male',
      }),
      makeField({
        id: 'c3', name: 'i_medical_history_asthma', type: 'checkbox', page: 2,
        groupKey: 'medical_history_asthma', optionKey: 'yes', optionLabel: 'Yes',
      }),
    ];

    const filled = applySearchFillRowToFields({
      row: parsed.rows[0],
      fields,
      checkboxRules: [],
      textTransformRules: [],
      dataSourceKind: 'sql',
    });

    // Justin Thakral: i_sex_f=true, i_sex_m=false
    expect(filled.find((f) => f.id === 'c1')?.value).toBe(true);
    expect(filled.find((f) => f.id === 'c2')?.value).toBe(false);
    // i_medical_history_asthma=true
    expect(filled.find((f) => f.id === 'c3')?.value).toBe(true);
  });

  it('SQL schema types are explicit — no inference needed', () => {
    const byName = Object.fromEntries(parsed.schema.fields.map((f) => [f.name, f.type]));
    // SQL declares types directly rather than guessing from sample values
    expect(byName.patient_birthdate).toBe('date');
    expect(byName.i_sex_f).toBe('bool');
    expect(byName.dental_insurance_deductible_amount).toBe('int');
    expect(byName.patient_name).toBe('string');
  });
});

// -----------------------------------------------------------------------
// TXT: schema-only import — no row data, no fill
// -----------------------------------------------------------------------
describe('TXT schema → fill integration', () => {
  const txtContent = [
    '# Patient intake schema',
    'patient_name:string',
    'patient_birthdate:date',
    'patient_city:string',
    'i_sex_f:bool',
    'i_sex_m:bool',
    'employer_name:string',
    'medication_1:string',
  ].join('\n');

  it('parses schema fields but produces zero rows', () => {
    const schema = parseSchemaText(txtContent);
    expect(schema.fields).toHaveLength(7);
    expect(schema.sampleCount).toBe(0);
    expect(schema.fields[0]).toEqual({ name: 'patient_name', type: 'string' });
    expect(schema.fields[1]).toEqual({ name: 'patient_birthdate', type: 'date' });
    expect(schema.fields[3]).toEqual({ name: 'i_sex_f', type: 'bool' });
  });

  it('TXT schema supports mapping but fill produces no value changes without row data', () => {
    const schema = parseSchemaText(txtContent);
    const fields: PdfField[] = [
      makeField({ id: 'f1', name: 'patient_name', type: 'text', page: 1 }),
      makeField({ id: 'f2', name: 'patient_city', type: 'text', page: 1 }),
    ];

    // With an empty row, applySearchFillRowToFields should leave values untouched
    const filled = applySearchFillRowToFields({
      row: {},
      fields,
      checkboxRules: [],
      textTransformRules: [],
      dataSourceKind: 'txt',
    });

    // No row data → fields should not get meaningful values
    expect(filled.find((f) => f.id === 'f1')?.value).toBeUndefined();
    expect(filled.find((f) => f.id === 'f2')?.value).toBeUndefined();

    // But the schema itself is valid for AI mapping
    expect(schema.fields.map((f) => f.name)).toContain('patient_name');
    expect(schema.fields.map((f) => f.name)).toContain('employer_name');
  });

  it('TXT schema with external CSV row data fills correctly', () => {
    // Simulates the real workflow: TXT for schema mapping, then CSV for row data
    const schema = parseSchemaText(txtContent);
    const columns = schema.fields.map((f) => f.name);
    expect(columns).toContain('patient_name');

    // User later uploads CSV and gets a row — fill should work
    const csvRow = {
      patient_name: 'Test Patient',
      patient_city: 'New York',
      employer_name: 'Test Corp',
      medication_1: 'Aspirin 81mg',
    };

    const fields: PdfField[] = [
      makeField({ id: 'f1', name: 'patient_name', type: 'text', page: 1 }),
      makeField({ id: 'f2', name: 'patient_city', type: 'text', page: 1 }),
      makeField({ id: 'f3', name: 'medication_1', type: 'text', page: 2 }),
    ];

    const filled = applySearchFillRowToFields({
      row: csvRow,
      fields,
      checkboxRules: [],
      textTransformRules: [],
      dataSourceKind: 'csv',
    });

    expect(filled.find((f) => f.id === 'f1')?.value).toBe('Test Patient');
    expect(filled.find((f) => f.id === 'f2')?.value).toBe('New York');
    expect(filled.find((f) => f.id === 'f3')?.value).toBe('Aspirin 81mg');
  });
});

// -----------------------------------------------------------------------
// SQL without INSERT: schema-only, same behavior as TXT
// -----------------------------------------------------------------------
describe('SQL without INSERT → schema-only fill integration', () => {
  const schemaOnlySql = `
    CREATE TABLE patients (
      patient_name VARCHAR(200),
      patient_birthdate DATE,
      active BOOLEAN
    );
  `;

  it('returns zero rows when SQL has no INSERT statements', () => {
    const result = parseSql(schemaOnlySql);
    expect(result.schema.fields).toHaveLength(3);
    expect(result.rows).toHaveLength(0);
    expect(result.columns).toEqual(['patient_name', 'patient_birthdate', 'active']);
  });

  it('schema-only SQL cannot fill fields without row data', () => {
    const result = parseSql(schemaOnlySql);
    const fields: PdfField[] = [
      makeField({ id: 'f1', name: 'patient_name', type: 'text', page: 1 }),
    ];

    const filled = applySearchFillRowToFields({
      row: {},
      fields,
      checkboxRules: [],
      textTransformRules: [],
      dataSourceKind: 'sql',
    });

    expect(filled.find((f) => f.id === 'f1')?.value).toBeUndefined();
  });
});
