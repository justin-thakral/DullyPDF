import { useMemo, useState } from 'react';
import type { CalculationFieldRole, FormulaNode, NumericValueType, PdfField } from '../../types';
import { DialogCloseButton, DialogFrame } from '../ui/Dialog';
import {
  buildLinearFormula,
  defaultCalculationMetadata,
  evaluateFormula,
  extractFormulaDependencies,
  formatFormulaForDisplay,
  getFormulaDependencyFields,
  isCalculatedRole,
  validateFormula,
  type FormulaBuilderRow,
  type FormulaOperator,
} from '../../utils/calculationFields';
import './CalculationSetupDialog.css';

export type CalculationSetupIntent =
  | 'number_input'
  | 'calculated_output'
  | 'convert'
  | 'edit'
  | 'review_imported'
  | 'rebuild_imported';

type CalculationSetupDialogProps = {
  open: boolean;
  field: PdfField | null;
  fields: PdfField[];
  intent: CalculationSetupIntent;
  onClose: () => void;
  onSave: (fieldId: string, updates: Partial<PdfField>) => void;
};

type CalculationSetupDialogContentProps = Omit<CalculationSetupDialogProps, 'field'> & {
  field: PdfField;
};

const FORMULA_OPERATORS: FormulaOperator[] = ['+', '-', '*', '/'];

function roleForIntent(intent: CalculationSetupIntent, field: PdfField | null): CalculationFieldRole {
  if (intent === 'number_input') return 'number_input';
  if (intent === 'calculated_output' || intent === 'rebuild_imported') return 'calculated_output';
  if (intent === 'review_imported') return 'external_imported_calculation';
  return field?.calculation?.role && field.calculation.role !== 'none'
    ? field.calculation.role
    : 'number_input';
}

function rowsFromFormula(formula: FormulaNode | undefined): FormulaBuilderRow[] {
  if (!formula) return [];
  if (formula.kind === 'field') {
    return [{ kind: 'field', fieldId: formula.fieldId, operator: '+' }];
  }
  if (formula.kind === 'constant') {
    return [{ kind: 'constant', value: formula.value, operator: '+' }];
  }
  if (formula.kind === 'binary') {
    const leftRows = rowsFromFormula(formula.left);
    if (!leftRows.length) {
      return [];
    }
    if (formula.right.kind === 'field') {
      return [...leftRows, { kind: 'field', fieldId: formula.right.fieldId, operator: formula.op }];
    }
    if (formula.right.kind === 'constant') {
      return [...leftRows, { kind: 'constant', value: formula.right.value, operator: formula.op }];
    }
  }
  return [];
}

function coerceValueType(value: unknown): NumericValueType {
  return value === 'decimal' ? 'decimal' : 'integer';
}

function roleSupportsReadOnlyToggle(role: CalculationFieldRole): boolean {
  return role === 'number_input';
}

function CalculationSetupDialogContent({
  open,
  field,
  fields,
  intent,
  onClose,
  onSave,
}: CalculationSetupDialogContentProps) {
  const initialRole = roleForIntent(intent, field);
  const [name, setName] = useState(field.name);
  const [role, setRole] = useState<CalculationFieldRole>(initialRole);
  const [valueType, setValueType] = useState<NumericValueType>(
    coerceValueType(field.valueType ?? field.calculation?.valueType),
  );
  const [required, setRequired] = useState(Boolean(field.required));
  const [readOnly, setReadOnly] = useState(initialRole === 'number_input' ? Boolean(field.readOnly) : true);
  const [defaultValue, setDefaultValue] = useState(
    field.value === null || field.value === undefined ? '' : String(field.value),
  );
  const [formulaRows, setFormulaRows] = useState<FormulaBuilderRow[]>(
    () => rowsFromFormula(field.calculation?.formula),
  );
  const [pendingDependencyId, setPendingDependencyId] = useState('');
  const [pendingOperator, setPendingOperator] = useState<FormulaOperator>('+');
  const [pendingConstant, setPendingConstant] = useState('');
  const [rounding, setRounding] = useState<'round' | 'floor' | 'ceil' | 'truncate'>(
    field.calculation?.output?.rounding ?? 'round',
  );
  const [blankInputBehavior, setBlankInputBehavior] =
    useState<'treat_as_zero' | 'blank_result' | 'validation_error'>(
      field.calculation?.output?.blankInputBehavior ?? 'treat_as_zero',
    );
  const [divideByZeroBehavior, setDivideByZeroBehavior] =
    useState<'blank_result' | 'validation_error'>(
      field.calculation?.output?.divideByZeroBehavior ?? 'blank_result',
    );
  const [editingImported, setEditingImported] = useState(intent === 'rebuild_imported');

  const importedReviewOnly = role === 'external_imported_calculation' && !editingImported;
  const effectiveRole = importedReviewOnly ? 'external_imported_calculation' : role;
  const calculated = isCalculatedRole(effectiveRole);
  const dependencyFields = useMemo(
    () => getFormulaDependencyFields(fields, field?.id ?? null),
    [field?.id, fields],
  );
  const dependencyIds = new Set(dependencyFields.map((entry) => entry.id));
  const normalizedRows = formulaRows.filter((row) => (
    row.kind === 'constant' ? Number.isFinite(Number(row.value)) : Boolean(row.fieldId && dependencyIds.has(row.fieldId))
  ));
  const formula = buildLinearFormula(normalizedRows);
  const formulaSummary = formatFormulaForDisplay(formula, fields);
  const validation = calculated
    ? validateFormula(formula, fields, field.id)
    : { valid: true, errors: [], dependencies: [] };
  const previewValues = useMemo(() => {
    return new Map(fields.map((entry) => [
      entry.id,
      entry.id === field.id ? defaultValue : entry.value,
    ]));
  }, [defaultValue, field.id, fields]);
  const preview = calculated
    ? evaluateFormula(formula, previewValues, {
        valueType,
        rounding,
        blankInputBehavior,
        divideByZeroBehavior,
      })
    : null;
  const importedSummary = field?.calculation?.imported?.rawActionSummary || 'External AcroForm calculation metadata was detected.';

  const handleAddDependency = () => {
    if (!pendingDependencyId) return;
    setFormulaRows((prev) => [...prev, { kind: 'field', fieldId: pendingDependencyId, operator: prev.length ? pendingOperator : '+' }]);
    setPendingDependencyId('');
    setPendingOperator('+');
  };

  const handleAddConstant = () => {
    const value = Number(pendingConstant);
    if (!Number.isFinite(value)) return;
    setFormulaRows((prev) => [...prev, { kind: 'constant', value, operator: prev.length ? pendingOperator : '+' }]);
    setPendingConstant('');
    setPendingOperator('+');
  };

  const handleRowOperatorChange = (index: number, operator: FormulaOperator) => {
    setFormulaRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, operator } : row
    )));
  };

  const handleRemoveRow = (index: number) => {
    setFormulaRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSave = () => {
    if (importedReviewOnly) return;
    const normalizedName = name.trim() || field.name;
    const normalizedRole = effectiveRole === 'external_imported_calculation' ? 'calculated_output' : effectiveRole;
    const normalizedReadOnly = roleSupportsReadOnlyToggle(normalizedRole) ? readOnly : true;
    const nextFormula = isCalculatedRole(normalizedRole) ? formula : undefined;
    if (nextFormula && !validateFormula(nextFormula, fields, field.id).valid) {
      return;
    }
    const metadata = defaultCalculationMetadata(normalizedRole, valueType);
    if (nextFormula) {
      metadata.formula = nextFormula;
      metadata.dependencies = Array.from(new Set(extractFormulaDependencies(nextFormula)));
      metadata.output = {
        valueType,
        rounding,
        blankInputBehavior,
        divideByZeroBehavior,
      };
    }
    onSave(field.id, {
      name: normalizedName,
      type: 'text',
      valueType,
      required,
      readOnly: normalizedReadOnly,
      value: defaultValue,
      calculation: metadata,
    });
  };

  const title = importedReviewOnly
    ? 'Review Imported Calculation'
    : calculated
      ? 'Set Up Calculated Field'
      : 'Set Up Number Input';

  return (
    <DialogFrame
      open={open}
      onClose={onClose}
      className="calculation-setup-dialog"
      labelledBy="calculation-setup-title"
    >
      <header className="calculation-setup-dialog__header">
        <div>
          <h2 id="calculation-setup-title">{title}</h2>
          <p>{field.name}</p>
        </div>
        <DialogCloseButton onClick={onClose} label="Close calculation setup" />
      </header>

      <div className="calculation-setup-dialog__body">
        {importedReviewOnly ? (
          <div className="calculation-setup-dialog__notice">
            <strong>Imported external calculation</strong>
            <span>{importedSummary}</span>
          </div>
        ) : null}

        <label className="calculation-setup-dialog__field">
          <span>Field name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} disabled={importedReviewOnly} />
        </label>

        <label className="calculation-setup-dialog__field">
          <span>Role</span>
          <select
            value={effectiveRole}
            disabled={importedReviewOnly}
            onChange={(event) => {
              const nextRole = event.target.value as CalculationFieldRole;
              setRole(nextRole);
              if (!roleSupportsReadOnlyToggle(nextRole)) {
                setReadOnly(true);
              }
            }}
          >
            <option value="number_input">Manual number input</option>
            <option value="calculated_output">Calculated output</option>
            <option value="calculated_intermediate">Calculated and reusable</option>
            {effectiveRole === 'external_imported_calculation' ? (
              <option value="external_imported_calculation">Imported external calculation</option>
            ) : null}
          </select>
        </label>

        <div className="calculation-setup-dialog__grid">
          <label className="calculation-setup-dialog__field">
            <span>Numeric type</span>
            <select
              value={valueType}
              disabled={importedReviewOnly}
              onChange={(event) => setValueType(coerceValueType(event.target.value))}
            >
              <option value="integer">Integer</option>
              <option value="decimal">Decimal</option>
            </select>
          </label>
          <label className="calculation-setup-dialog__field">
            <span>Default value</span>
            <input
              inputMode="decimal"
              value={defaultValue}
              disabled={importedReviewOnly}
              onChange={(event) => setDefaultValue(event.target.value)}
            />
          </label>
        </div>

        <div className="calculation-setup-dialog__toggles">
          <label>
            <input
              type="checkbox"
              checked={required}
              disabled={importedReviewOnly}
              onChange={(event) => setRequired(event.target.checked)}
            />
            Required
          </label>
          <label>
            <input
              type="checkbox"
              checked={roleSupportsReadOnlyToggle(effectiveRole) ? readOnly : true}
              disabled={importedReviewOnly || !roleSupportsReadOnlyToggle(effectiveRole)}
              onChange={(event) => setReadOnly(event.target.checked)}
            />
            Read-only
          </label>
        </div>

        {calculated && !importedReviewOnly ? (
          <section className="calculation-setup-dialog__formula">
            <div className="calculation-setup-dialog__section-header">
              <h3>Equation builder</h3>
              <span>{formulaSummary}</span>
            </div>
            <div className="calculation-setup-dialog__preview">
              <strong>Preview</strong>
              <span>{preview?.ok ? preview.value ?? 'Blank result' : preview?.error ?? 'Formula is incomplete.'}</span>
            </div>
            <div className="calculation-setup-dialog__formula-add">
              <select
                aria-label="Formula operator"
                value={pendingOperator}
                disabled={!normalizedRows.length}
                onChange={(event) => setPendingOperator(event.target.value as FormulaOperator)}
              >
                {FORMULA_OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>{operator}</option>
                ))}
              </select>
              <select
                aria-label="Formula field"
                value={pendingDependencyId}
                onChange={(event) => setPendingDependencyId(event.target.value)}
              >
                <option value="">Choose numeric field</option>
                {dependencyFields.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name}</option>
                ))}
              </select>
              <button type="button" className="ui-button ui-button--secondary ui-button--compact" onClick={handleAddDependency}>
                Add field
              </button>
            </div>
            <div className="calculation-setup-dialog__formula-add">
              <select
                aria-label="Constant operator"
                value={pendingOperator}
                disabled={!normalizedRows.length}
                onChange={(event) => setPendingOperator(event.target.value as FormulaOperator)}
              >
                {FORMULA_OPERATORS.map((operator) => (
                  <option key={operator} value={operator}>{operator}</option>
                ))}
              </select>
              <input
                aria-label="Formula constant"
                inputMode="decimal"
                placeholder="Constant"
                value={pendingConstant}
                onChange={(event) => setPendingConstant(event.target.value)}
              />
              <button type="button" className="ui-button ui-button--secondary ui-button--compact" onClick={handleAddConstant}>
                Add constant
              </button>
            </div>
            <div className="calculation-setup-dialog__formula-list">
              {normalizedRows.length ? normalizedRows.map((row, index) => {
                const dependency = row.kind === 'field'
                  ? fields.find((entry) => entry.id === row.fieldId)
                  : null;
                const rowLabel = row.kind === 'constant' ? String(row.value) : dependency?.name || 'Missing field';
                return (
                  <div className="calculation-setup-dialog__formula-row" key={`${row.kind || 'field'}-${row.fieldId || row.value}-${index}`}>
                    {index === 0 ? (
                      <span className="calculation-setup-dialog__formula-start">Start</span>
                    ) : (
                      <select
                        aria-label={`Operator for ${dependency?.name || 'field'}`}
                        value={row.operator}
                        onChange={(event) => handleRowOperatorChange(index, event.target.value as FormulaOperator)}
                      >
                        {FORMULA_OPERATORS.map((operator) => (
                          <option key={operator} value={operator}>{operator}</option>
                        ))}
                      </select>
                    )}
                    <span>{rowLabel}</span>
                    <button type="button" className="ui-button ui-button--ghost ui-button--compact" onClick={() => handleRemoveRow(index)}>
                      Remove
                    </button>
                  </div>
                );
              }) : (
                <p className="calculation-setup-dialog__empty">Add numeric fields to build the equation.</p>
              )}
            </div>
            <div className="calculation-setup-dialog__grid">
              <label className="calculation-setup-dialog__field">
                <span>Integer rounding</span>
                <select value={rounding} onChange={(event) => setRounding(event.target.value as typeof rounding)}>
                  <option value="round">Round</option>
                  <option value="floor">Floor</option>
                  <option value="ceil">Ceil</option>
                  <option value="truncate">Truncate</option>
                </select>
              </label>
              <label className="calculation-setup-dialog__field">
                <span>Blank inputs</span>
                <select value={blankInputBehavior} onChange={(event) => setBlankInputBehavior(event.target.value as typeof blankInputBehavior)}>
                  <option value="treat_as_zero">Treat as zero</option>
                  <option value="blank_result">Blank result</option>
                  <option value="validation_error">Validation error</option>
                </select>
              </label>
              <label className="calculation-setup-dialog__field">
                <span>Divide by zero</span>
                <select value={divideByZeroBehavior} onChange={(event) => setDivideByZeroBehavior(event.target.value as typeof divideByZeroBehavior)}>
                  <option value="blank_result">Blank result</option>
                  <option value="validation_error">Validation error</option>
                </select>
              </label>
            </div>
            <div className={`calculation-setup-dialog__validation${validation.valid ? ' calculation-setup-dialog__validation--ok' : ''}`}>
              {validation.valid ? (
                <span>Formula is valid.</span>
              ) : (
                validation.errors.map((error) => <span key={error}>{error}</span>)
              )}
            </div>
          </section>
        ) : null}
      </div>

      <footer className="calculation-setup-dialog__actions">
        {importedReviewOnly ? (
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() => {
              setEditingImported(true);
              setRole('calculated_output');
              setReadOnly(true);
              setFormulaRows([]);
            }}
          >
            Rebuild in DullyPDF
          </button>
        ) : (
          <button
            type="button"
            className="ui-button ui-button--primary"
            disabled={calculated && !validation.valid}
            onClick={handleSave}
          >
            Save setup
          </button>
        )}
        <button type="button" className="ui-button ui-button--ghost" onClick={onClose}>
          {importedReviewOnly ? 'Close' : 'Cancel'}
        </button>
      </footer>
    </DialogFrame>
  );
}

export function CalculationSetupDialog(props: CalculationSetupDialogProps) {
  const { open, field, intent } = props;
  if (!open || !field) return null;
  return (
    <CalculationSetupDialogContent
      key={`${field.id}:${intent}:${field.calculation?.role ?? 'none'}`}
      {...props}
      field={field}
    />
  );
}

export default CalculationSetupDialog;
