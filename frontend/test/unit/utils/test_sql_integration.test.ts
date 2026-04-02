import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSql, parseSqlTables } from '../../../src/utils/sql';
import { parseCsv } from '../../../src/utils/csv';

const SQL_PATH = resolve(__dirname, '../../../../quickTestFiles/new_patient_forms_mock.sql');
const CSV_PATH = resolve(__dirname, '../../../../quickTestFiles/new_patient_forms_1915ccb015_mock.csv');

describe('SQL ↔ new_patient_forms integration', () => {
  const sqlText = readFileSync(SQL_PATH, 'utf-8');
  const csvText = readFileSync(CSV_PATH, 'utf-8');

  it('parses the mock SQL file and extracts the table', () => {
    const tables = parseSqlTables(sqlText);
    expect(tables).toHaveLength(1);
    expect(tables[0].tableName).toBe('new_patient_forms');
    expect(tables[0].fields.length).toBeGreaterThan(50);
  });

  it('produces schema fields from SQL', () => {
    const result = parseSql(sqlText);
    expect(result.schema.fields.length).toBeGreaterThan(50);

    // Spot-check expected field types
    const byName = Object.fromEntries(result.schema.fields.map((f) => [f.name, f.type]));
    expect(byName.patient_name).toBe('string');
    expect(byName.patient_birthdate).toBe('date');
    expect(byName.patient_city).toBe('string');
    expect(byName.patient_state).toBe('string');
    expect(byName.i_sex_f).toBe('bool');
    expect(byName.i_sex_m).toBe('bool');
    expect(byName.dental_insurance_deductible_amount).toBe('int');
    expect(byName.i_medical_history_diabetes).toBe('bool');
    expect(byName.medication_1).toBe('string');
    expect(byName.patient_or_guardian_signature_date).toBe('date');
  });

  it('SQL field names match CSV header names exactly', () => {
    const result = parseSql(sqlText);
    const sqlNames = new Set(result.schema.fields.map((f) => f.name));

    const csv = parseCsv(csvText);
    const csvNames = csv.columns;

    // Every CSV column should have a matching SQL field
    const missing = csvNames.filter((col) => !sqlNames.has(col));
    expect(missing).toEqual([]);
  });

  it('SQL field count matches CSV column count', () => {
    const result = parseSql(sqlText);
    const csv = parseCsv(csvText);
    expect(result.schema.fields.length).toBe(csv.columns.length);
  });

  it('type inference from SQL is at least as good as CSV inference (dates and bools)', () => {
    const result = parseSql(sqlText);
    const byName = Object.fromEntries(result.schema.fields.map((f) => [f.name, f.type]));

    // SQL has explicit date types where CSV would need value sampling
    expect(byName.patient_birthdate).toBe('date');
    expect(byName.dental_history_last_dental_care_date).toBe('date');
    expect(byName.date_of_last_visit).toBe('date');

    // SQL has explicit boolean types where CSV would need value sampling
    expect(byName.i_fen_phen_yes).toBe('bool');
    expect(byName.i_pregnant_no).toBe('bool');
    expect(byName.i_medical_history_anemia).toBe('bool');
  });

  it('parses INSERT row data for Justin Thakral', () => {
    const result = parseSql(sqlText);
    expect(result.rows).toHaveLength(1);
    expect(result.schema.sampleCount).toBe(1);

    const row = result.rows[0];
    expect(row.patient_name).toBe('Justin Thakral');
    expect(row.patient_birthdate).toBe('1990-02-14');
    expect(row.patient_city).toBe('San Francisco');
    expect(row.patient_state).toBe('CA');
    expect(row.patient_email).toBe('justin.thakral@example.com');
    expect(row.employer_name).toBe('Thakral Analytics');
    expect(row.emergency_contact_name).toBe('Aria Thakral');
    expect(row.medication_1).toBe('Lisinopril 10mg');
    expect(row.allergy_1).toBe('Penicillin');
  });

  it('SQL row values match CSV row values for key fields', () => {
    const sqlResult = parseSql(sqlText);
    const csv = parseCsv(csvText);

    const sqlRow = sqlResult.rows[0];
    const csvRow = csv.rows[0];

    expect(sqlRow.patient_name).toBe(csvRow.patient_name);
    expect(sqlRow.patient_birthdate).toBe(csvRow.patient_birthdate);
    expect(sqlRow.patient_city).toBe(csvRow.patient_city);
    expect(sqlRow.patient_email).toBe(csvRow.patient_email);
    expect(sqlRow.employer_name).toBe(csvRow.employer_name);
    expect(sqlRow.dental_insurance_company).toBe(csvRow.dental_insurance_company);
  });
});
