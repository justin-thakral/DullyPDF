import type {
  CalculationFieldRole,
  CalculationMetadata,
  FormulaNode,
  NumericValueType,
  PdfField,
} from '../types';

export type CalculationCreateTool = 'number-input' | 'calculated-output';
export type FormulaOperator = '+' | '-' | '*' | '/';

export type FormulaBuilderRow = {
  kind?: 'field' | 'constant';
  operator: FormulaOperator;
  fieldId?: string;
  value?: number | string;
};

export type FormulaEvaluationOptions = {
  blankInputBehavior?: 'treat_as_zero' | 'blank_result' | 'validation_error';
  divideByZeroBehavior?: 'blank_result' | 'validation_error';
  valueType?: NumericValueType;
  rounding?: 'round' | 'floor' | 'ceil' | 'truncate';
};

export type FormulaEvaluationResult = {
  ok: boolean;
  value: number | null;
  error?: string;
};

export type FormulaValidationResult = {
  valid: boolean;
  errors: string[];
  dependencies: string[];
};

export type CalculationTopologicalSortResult = {
  orderedFields: PdfField[];
  cycleFieldIds: string[];
};

function envFlagEnabled(raw: unknown): boolean | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
}

export function calculationFieldsEnabled(): boolean {
  const configured = envFlagEnabled(import.meta.env.VITE_ENABLE_CALCULATION_FIELDS);
  if (configured !== null) return configured;
  return !import.meta.env.PROD;
}

export const CALCULATION_CREATE_TOOLS: CalculationCreateTool[] = calculationFieldsEnabled()
  ? ['number-input', 'calculated-output']
  : [];

export function isCalculationCreateTool(tool: string | null | undefined): tool is CalculationCreateTool {
  return calculationFieldsEnabled() && (tool === 'number-input' || tool === 'calculated-output');
}

export function calculationRoleLabel(role: CalculationFieldRole | undefined): string {
  switch (role) {
    case 'number_input':
      return 'Number input';
    case 'calculated_output':
      return 'Calculated';
    case 'calculated_intermediate':
      return 'Reusable calculation';
    case 'external_imported_calculation':
      return 'Imported calculation';
    default:
      return 'Calculation ready';
  }
}

export function createToolCalculationRole(tool: CalculationCreateTool): CalculationFieldRole {
  return tool === 'number-input' ? 'number_input' : 'calculated_output';
}

export function defaultCalculationMetadata(
  role: CalculationFieldRole,
  valueType: NumericValueType = 'integer',
): CalculationMetadata {
  const metadata: CalculationMetadata = {
    role,
    valueType,
  };
  if (role === 'calculated_output' || role === 'calculated_intermediate') {
    metadata.dependencies = [];
    metadata.output = {
      valueType,
      rounding: 'round',
      blankInputBehavior: 'treat_as_zero',
      divideByZeroBehavior: 'blank_result',
    };
  }
  return metadata;
}

export function calculationFieldDefaultsForTool(tool: CalculationCreateTool): Partial<PdfField> {
  const role = createToolCalculationRole(tool);
  const valueType: NumericValueType = 'integer';
  return {
    type: 'text',
    valueType,
    readOnly: role !== 'number_input',
    required: false,
    value: '',
    calculation: defaultCalculationMetadata(role, valueType),
  };
}

export function isCalculatedRole(role: CalculationFieldRole | undefined): boolean {
  return role === 'calculated_output' || role === 'calculated_intermediate';
}

export function isFormulaDependencyCandidate(field: PdfField, targetFieldId?: string | null): boolean {
  if (targetFieldId && field.id === targetFieldId) return false;
  if (field.type !== 'text') return false;
  const role = field.calculation?.role;
  if (role === 'external_imported_calculation') {
    return Boolean(field.calculation?.imported?.supported);
  }
  return field.valueType === 'integer' || field.valueType === 'decimal' || role === 'number_input' || role === 'calculated_intermediate';
}

export function getFormulaDependencyFields(fields: PdfField[], targetFieldId?: string | null): PdfField[] {
  return fields.filter((field) => (
    isFormulaDependencyCandidate(field, targetFieldId)
    && !(targetFieldId && wouldCreateCycle(fields, targetFieldId, field.id))
  ));
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function buildLinearFormula(rows: FormulaBuilderRow[]): FormulaNode | undefined {
  const validRows = rows
    .map((row): FormulaBuilderRow | null => {
      if (row.kind === 'constant') {
        return finiteNumber(row.value) === null ? null : row;
      }
      return row.fieldId ? { ...row, kind: 'field' } : null;
    })
    .filter((row): row is FormulaBuilderRow => row !== null);
  if (!validRows.length) return undefined;
  const first = validRows[0];
  let node: FormulaNode = first.kind === 'constant'
    ? { kind: 'constant', value: finiteNumber(first.value) ?? 0 }
    : { kind: 'field', fieldId: first.fieldId || '' };
  for (const row of validRows.slice(1)) {
    const right: FormulaNode = row.kind === 'constant'
      ? { kind: 'constant', value: finiteNumber(row.value) ?? 0 }
      : { kind: 'field', fieldId: row.fieldId || '' };
    node = {
      kind: 'binary',
      op: row.operator,
      left: node,
      right,
    };
  }
  return node;
}

export function extractFormulaDependencies(formula: FormulaNode | undefined): string[] {
  if (!formula) return [];
  if (formula.kind === 'field') return [formula.fieldId];
  if (formula.kind === 'constant') return [];
  if (formula.kind === 'unary') return extractFormulaDependencies(formula.value);
  return [
    ...extractFormulaDependencies(formula.left),
    ...extractFormulaDependencies(formula.right),
  ];
}

function fieldValuesGet(fieldValues: Record<string, unknown> | Map<string, unknown>, fieldId: string): unknown {
  return fieldValues instanceof Map ? fieldValues.get(fieldId) : fieldValues[fieldId];
}

function normalizeFormulaNumber(
  value: unknown,
  options: FormulaEvaluationOptions,
): FormulaEvaluationResult {
  const parsed = finiteNumber(value);
  if (parsed !== null) {
    return { ok: true, value: parsed };
  }
  if (options.blankInputBehavior === 'blank_result') {
    return { ok: true, value: null };
  }
  if (options.blankInputBehavior === 'validation_error') {
    return { ok: false, value: null, error: 'A dependency is blank or not numeric.' };
  }
  return { ok: true, value: 0 };
}

function applyFormulaOutputOptions(
  value: number | null,
  options: FormulaEvaluationOptions,
): number | null {
  if (value === null) return null;
  if (options.valueType !== 'integer') return value;
  switch (options.rounding) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'truncate':
      return value < 0 ? Math.ceil(value) : Math.floor(value);
    case 'round':
    default:
      return Math.round(value);
  }
}

function evaluateFormulaNode(
  formula: FormulaNode,
  fieldValues: Record<string, unknown> | Map<string, unknown>,
  options: FormulaEvaluationOptions,
): FormulaEvaluationResult {
  if (formula.kind === 'constant') {
    return Number.isFinite(formula.value)
      ? { ok: true, value: formula.value }
      : { ok: false, value: null, error: 'Formula contains an invalid constant.' };
  }
  if (formula.kind === 'field') {
    return normalizeFormulaNumber(fieldValuesGet(fieldValues, formula.fieldId), options);
  }
  if (formula.kind === 'unary') {
    if (formula.op !== '-') {
      return { ok: false, value: null, error: 'Formula contains an invalid unary operator.' };
    }
    const value = evaluateFormulaNode(formula.value, fieldValues, options);
    if (!value.ok || value.value === null) return value;
    return { ok: true, value: -value.value };
  }
  if (!['+', '-', '*', '/'].includes(formula.op)) {
    return { ok: false, value: null, error: 'Formula contains an invalid operator.' };
  }
  const left = evaluateFormulaNode(formula.left, fieldValues, options);
  if (!left.ok || left.value === null) return left;
  const right = evaluateFormulaNode(formula.right, fieldValues, options);
  if (!right.ok || right.value === null) return right;
  if (formula.op === '+') return { ok: true, value: left.value + right.value };
  if (formula.op === '-') return { ok: true, value: left.value - right.value };
  if (formula.op === '*') return { ok: true, value: left.value * right.value };
  if (right.value === 0) {
    return options.divideByZeroBehavior === 'validation_error'
      ? { ok: false, value: null, error: 'Formula divides by zero.' }
      : { ok: true, value: null };
  }
  return { ok: true, value: left.value / right.value };
}

export function evaluateFormula(
  formula: FormulaNode | undefined,
  fieldValues: Record<string, unknown> | Map<string, unknown>,
  options: FormulaEvaluationOptions = {},
): FormulaEvaluationResult {
  if (!formula) {
    return { ok: false, value: null, error: 'Add at least one formula item.' };
  }
  const result = evaluateFormulaNode(formula, fieldValues, {
    blankInputBehavior: 'treat_as_zero',
    divideByZeroBehavior: 'blank_result',
    ...options,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    value: applyFormulaOutputOptions(result.value, options),
  };
}

function formulaDependenciesForField(field: PdfField): string[] {
  const formulaDependencies = extractFormulaDependencies(field.calculation?.formula);
  if (formulaDependencies.length) return formulaDependencies;
  return Array.isArray(field.calculation?.dependencies) ? field.calculation.dependencies : [];
}

export function wouldCreateCycle(fields: PdfField[], targetFieldId: string, dependencyId: string): boolean {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const visited = new Set<string>();
  const walk = (fieldId: string): boolean => {
    if (fieldId === targetFieldId) return true;
    if (visited.has(fieldId)) return false;
    visited.add(fieldId);
    const field = fieldsById.get(fieldId);
    if (!field || !isCalculatedRole(field.calculation?.role)) return false;
    return formulaDependenciesForField(field).some((nextId) => walk(nextId));
  };
  return walk(dependencyId);
}

function validateFormulaNode(
  formula: FormulaNode | undefined,
  fieldsById: Map<string, PdfField>,
  fields: PdfField[],
  targetFieldId: string,
  errors: string[],
): string[] {
  if (!formula || typeof formula !== 'object') {
    errors.push('Add at least one formula item.');
    return [];
  }
  if (formula.kind === 'constant') {
    if (!Number.isFinite(formula.value)) {
      errors.push('Formula contains an invalid constant.');
    }
    return [];
  }
  if (formula.kind === 'field') {
    const field = fieldsById.get(formula.fieldId);
    if (!field) {
      errors.push('Formula references a missing field.');
      return [formula.fieldId];
    }
    if (!isFormulaDependencyCandidate(field, targetFieldId)) {
      errors.push(`${field.name} is not a numeric formula dependency.`);
    }
    if (wouldCreateCycle(fields, targetFieldId, formula.fieldId)) {
      errors.push(`${field.name} would create a calculation cycle.`);
    }
    return [formula.fieldId];
  }
  if (formula.kind === 'unary') {
    if (formula.op !== '-') {
      errors.push('Formula contains an invalid unary operator.');
    }
    return validateFormulaNode(formula.value, fieldsById, fields, targetFieldId, errors);
  }
  if (formula.kind === 'binary') {
    if (!['+', '-', '*', '/'].includes(formula.op)) {
      errors.push('Formula contains an invalid operator.');
    }
    return [
      ...validateFormulaNode(formula.left, fieldsById, fields, targetFieldId, errors),
      ...validateFormulaNode(formula.right, fieldsById, fields, targetFieldId, errors),
    ];
  }
  errors.push('Formula contains an invalid node.');
  return [];
}

export function validateFormula(
  formula: FormulaNode | undefined,
  fields: PdfField[],
  targetFieldId: string,
): FormulaValidationResult {
  const errors: string[] = [];
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const dependencies = validateFormulaNode(formula, fieldsById, fields, targetFieldId, errors);
  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    dependencies: Array.from(new Set(dependencies.filter(Boolean))),
  };
}

export function topologicallySortCalculatedFields(fields: PdfField[]): CalculationTopologicalSortResult {
  const calculatedFields = fields.filter((field) => isCalculatedRole(field.calculation?.role));
  const calculatedIds = new Set(calculatedFields.map((field) => field.id));
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleFieldIds = new Set<string>();
  const orderedFields: PdfField[] = [];

  const visit = (fieldId: string, path: string[]) => {
    if (visited.has(fieldId)) return;
    if (visiting.has(fieldId)) {
      const cycleStart = path.indexOf(fieldId);
      for (const cyclicId of path.slice(Math.max(0, cycleStart))) {
        cycleFieldIds.add(cyclicId);
      }
      cycleFieldIds.add(fieldId);
      return;
    }
    const field = fieldsById.get(fieldId);
    if (!field || !calculatedIds.has(fieldId)) return;
    visiting.add(fieldId);
    for (const dependencyId of formulaDependenciesForField(field)) {
      if (calculatedIds.has(dependencyId)) {
        visit(dependencyId, [...path, fieldId]);
      }
    }
    visiting.delete(fieldId);
    visited.add(fieldId);
    orderedFields.push(field);
  };

  for (const field of calculatedFields) {
    visit(field.id, []);
  }

  return {
    orderedFields,
    cycleFieldIds: Array.from(cycleFieldIds),
  };
}

function formatFormulaNode(formula: FormulaNode | undefined, fieldsById: Map<string, PdfField>): string {
  if (!formula) return '';
  if (formula.kind === 'constant') return String(formula.value);
  if (formula.kind === 'field') {
    return fieldsById.get(formula.fieldId)?.name || 'Missing field';
  }
  if (formula.kind === 'unary') {
    return `-${formatFormulaNode(formula.value, fieldsById)}`;
  }
  return `${formatFormulaNode(formula.left, fieldsById)} ${formula.op} ${formatFormulaNode(formula.right, fieldsById)}`;
}

export function formatFormulaForDisplay(formula: FormulaNode | undefined, fields: PdfField[]): string {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  return formatFormulaNode(formula, fieldsById) || 'No formula set';
}
