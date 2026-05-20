import type { BarcodeClass, FieldDependencyRef, Pdf417DependencyKey, Pdf417ScanData, PdfField } from '../types';
import { BARCODE_ID_LENGTH, barcodeDigitsFromValue } from './barcode';
import { QR_VALUE_MAX_LENGTH, qrTextFromValue } from './qr';

// PDF417 fields no longer ship hardcoded label defaults. The form creator
// defines every class via the barcode modal; legacy mappings are migrated into
// freeform user-labeled classes on load.
export const PDF417_DEPENDENCY_FIELDS: Array<{
  key: Pdf417DependencyKey;
  label: string;
  required?: boolean;
}> = [];

const LEGACY_PDF417_KEY_LABELS: Record<Pdf417DependencyKey, string> = {
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  streetAddress: 'Street address',
  city: 'City',
  state: 'State',
  zip: 'ZIP',
  dob: 'DOB',
  sex: 'Sex',
  eyeColor: 'Eye color',
  height: 'Height',
  customerId: 'Customer ID',
  issueDate: 'Issue date',
  expirationDate: 'Expiration date',
};

const APP_ONLY_FIELD_TYPES = new Set<PdfField['type']>(['image', 'pdf417', 'barcode', 'qr']);

export type DependencyValueStatus = 'ready' | 'missing' | 'blank' | 'invalid';

export type ResolvedDependencyValue = {
  status: Exclude<DependencyValueStatus, 'invalid'>;
  field: PdfField | null;
  value: string;
};

export type BarcodeResolution = {
  sourceField: PdfField | null;
  sourceValue: string;
  digits: string;
  status: DependencyValueStatus;
  message: string;
  usesDependency: boolean;
};

export type Pdf417Resolution = {
  data: Pdf417ScanData;
  fieldStatuses: Partial<Record<Pdf417DependencyKey, ResolvedDependencyValue>>;
  messages: string[];
  isComplete: boolean;
};

export type QrResolution = {
  sourceField: PdfField | null;
  sourceValue: string;
  value: string;
  status: DependencyValueStatus;
  message: string;
  usesDependency: boolean;
};

function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).trim();
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function splitManualName(name: string | null | undefined): Pick<Pdf417ScanData, 'firstName' | 'middleName' | 'lastName'> {
  const parts = cleanText(name).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

export function isDependencySourceField(field: PdfField, ownerFieldId?: string | null): boolean {
  if (field.id === ownerFieldId) return false;
  return !APP_ONLY_FIELD_TYPES.has(field.type);
}

export function dependencyRefForField(field: PdfField): FieldDependencyRef {
  return {
    fieldId: field.id,
    fieldName: field.name,
  };
}

export function dependencySourceFields(fields: PdfField[], ownerFieldId?: string | null): PdfField[] {
  return fields.filter((field) => isDependencySourceField(field, ownerFieldId));
}

export function resolveDependencyRef(
  ref: FieldDependencyRef | null | undefined,
  fields: PdfField[],
  ownerFieldId?: string | null,
): ResolvedDependencyValue {
  if (!ref) {
    return { status: 'missing', field: null, value: '' };
  }
  const byId = fields.find((field) => field.id === ref.fieldId);
  const byName = fields.find((field) => normalizeName(field.name) === normalizeName(ref.fieldName));
  const field = byId ?? byName ?? null;
  if (!field || !isDependencySourceField(field, ownerFieldId)) {
    return { status: 'missing', field: null, value: '' };
  }
  const value = cleanText(field.value);
  return {
    status: value ? 'ready' : 'blank',
    field,
    value,
  };
}

export function resolveBarcodeValue(field: PdfField, fields: PdfField[]): BarcodeResolution {
  if (Array.isArray(field.barcodeClasses)) {
    const resolution = resolveBarcodeClasses(field, fields);
    const first = resolution.classes[0];
    if (!first) {
      return {
        sourceField: null,
        sourceValue: '',
        digits: '',
        status: 'blank',
        message: 'Add a class with a 9 digit value.',
        usesDependency: false,
      };
    }
    const usesDependency = first.class.mode === 'field';
    if (first.status === 'missing') {
      return {
        sourceField: null,
        sourceValue: '',
        digits: '',
        status: 'missing',
        message: 'Class source field is missing.',
        usesDependency,
      };
    }
    if (first.status === 'blank') {
      return {
        sourceField: first.sourceField,
        sourceValue: '',
        digits: '',
        status: 'blank',
        message: 'Class value is blank.',
        usesDependency,
      };
    }
    const hasOnlyDigits = /^\d+$/.test(first.value);
    const digits = barcodeDigitsFromValue(first.value);
    if (!hasOnlyDigits) {
      return {
        sourceField: first.sourceField,
        sourceValue: first.value,
        digits,
        status: 'invalid',
        message: 'Class value must contain digits only.',
        usesDependency,
      };
    }
    if (digits.length !== BARCODE_ID_LENGTH) {
      return {
        sourceField: first.sourceField,
        sourceValue: first.value,
        digits,
        status: 'invalid',
        message: `Class value must be exactly ${BARCODE_ID_LENGTH} digits.`,
        usesDependency,
      };
    }
    return {
      sourceField: first.sourceField,
      sourceValue: first.value,
      digits,
      status: 'ready',
      message: `Scans as ${digits}`,
      usesDependency,
    };
  }
  const dependency = field.barcodeSourceField
    ? resolveDependencyRef(field.barcodeSourceField, fields, field.id)
    : null;
  const usesDependency = Boolean(field.barcodeSourceField);
  if (dependency) {
    if (dependency.status === 'missing') {
      return {
        sourceField: null,
        sourceValue: '',
        digits: '',
        status: 'missing',
        message: 'Source field is missing. Choose another field or clear the dependency.',
        usesDependency,
      };
    }
    if (dependency.status === 'blank') {
      return {
        sourceField: dependency.field,
        sourceValue: '',
        digits: '',
        status: 'blank',
        message: 'Source field is blank.',
        usesDependency,
      };
    }
    const hasOnlyDigits = /^\d+$/.test(dependency.value);
    const digits = barcodeDigitsFromValue(dependency.value);
    if (!hasOnlyDigits) {
      return {
        sourceField: dependency.field,
        sourceValue: dependency.value,
        digits,
        status: 'invalid',
        message: 'Source value must contain digits only.',
        usesDependency,
      };
    }
    if (digits.length !== BARCODE_ID_LENGTH) {
      return {
        sourceField: dependency.field,
        sourceValue: dependency.value,
        digits,
        status: 'invalid',
        message: `Source value must be exactly ${BARCODE_ID_LENGTH} digits.`,
        usesDependency,
      };
    }
    return {
      sourceField: dependency.field,
      sourceValue: dependency.value,
      digits,
      status: 'ready',
      message: `Scans as ${digits}`,
      usesDependency,
    };
  }

  const sourceValue = cleanText(field.value);
  const digits = barcodeDigitsFromValue(sourceValue);
  if (!digits) {
    return {
      sourceField: null,
      sourceValue,
      digits,
      status: 'blank',
      message: `Enter exactly ${BARCODE_ID_LENGTH} digits or choose a source field.`,
      usesDependency,
    };
  }
  if (digits.length !== BARCODE_ID_LENGTH) {
    return {
      sourceField: null,
      sourceValue,
      digits,
      status: 'invalid',
      message: `Enter exactly ${BARCODE_ID_LENGTH} digits before export.`,
      usesDependency,
    };
  }
  return {
    sourceField: null,
    sourceValue,
    digits,
    status: 'ready',
    message: `Scans as ${digits}`,
    usesDependency,
  };
}

export function resolveQrValue(field: PdfField, fields: PdfField[]): QrResolution {
  if (Array.isArray(field.barcodeClasses)) {
    const resolution = resolveBarcodeClasses(field, fields);
    const first = resolution.classes[0];
    if (!first) {
      return {
        sourceField: null,
        sourceValue: '',
        value: '',
        status: 'blank',
        message: 'Add a class with QR text.',
        usesDependency: false,
      };
    }
    const usesDependency = first.class.mode === 'field';
    if (first.status === 'missing') {
      return {
        sourceField: null,
        sourceValue: '',
        value: '',
        status: 'missing',
        message: 'Class source field is missing.',
        usesDependency,
      };
    }
    if (first.status === 'blank') {
      return {
        sourceField: first.sourceField,
        sourceValue: '',
        value: '',
        status: 'blank',
        message: 'Class value is blank.',
        usesDependency,
      };
    }
    if (first.value.length > QR_VALUE_MAX_LENGTH) {
      return {
        sourceField: first.sourceField,
        sourceValue: first.value,
        value: qrTextFromValue(first.value),
        status: 'invalid',
        message: `Class value must be ${QR_VALUE_MAX_LENGTH} characters or fewer.`,
        usesDependency,
      };
    }
    return {
      sourceField: first.sourceField,
      sourceValue: first.value,
      value: qrTextFromValue(first.value),
      status: 'ready',
      message: 'QR text is ready.',
      usesDependency,
    };
  }
  const dependency = field.qrSourceField
    ? resolveDependencyRef(field.qrSourceField, fields, field.id)
    : null;
  const usesDependency = Boolean(field.qrSourceField);
  if (dependency) {
    if (dependency.status === 'missing') {
      return {
        sourceField: null,
        sourceValue: '',
        value: '',
        status: 'missing',
        message: 'Source field is missing. Choose another field or clear the dependency.',
        usesDependency,
      };
    }
    if (dependency.status === 'blank') {
      return {
        sourceField: dependency.field,
        sourceValue: '',
        value: '',
        status: 'blank',
        message: 'Source field is blank.',
        usesDependency,
      };
    }
    if (dependency.value.length > QR_VALUE_MAX_LENGTH) {
      return {
        sourceField: dependency.field,
        sourceValue: dependency.value,
        value: qrTextFromValue(dependency.value),
        status: 'invalid',
        message: `Source value must be ${QR_VALUE_MAX_LENGTH} characters or fewer.`,
        usesDependency,
      };
    }
    return {
      sourceField: dependency.field,
      sourceValue: dependency.value,
      value: qrTextFromValue(dependency.value),
      status: 'ready',
      message: 'QR text is ready.',
      usesDependency,
    };
  }

  const sourceValue = cleanText(field.value);
  if (!sourceValue) {
    return {
      sourceField: null,
      sourceValue,
      value: '',
      status: 'blank',
      message: 'Enter QR text or choose a source field.',
      usesDependency,
    };
  }
  if (sourceValue.length > QR_VALUE_MAX_LENGTH) {
    return {
      sourceField: null,
      sourceValue,
      value: qrTextFromValue(sourceValue),
      status: 'invalid',
      message: `QR text must be ${QR_VALUE_MAX_LENGTH} characters or fewer.`,
      usesDependency,
    };
  }
  return {
    sourceField: null,
    sourceValue,
    value: qrTextFromValue(sourceValue),
    status: 'ready',
    message: 'QR text is ready.',
    usesDependency,
  };
}

const LEGACY_PDF417_KEY_ORDER: Pdf417DependencyKey[] = [
  'firstName', 'middleName', 'lastName',
  'streetAddress', 'city', 'state', 'zip',
  'dob', 'sex', 'eyeColor', 'height',
  'customerId', 'issueDate', 'expirationDate',
];

export function resolvePdf417Data(field: PdfField, fields: PdfField[]): Pdf417Resolution {
  const manualName = splitManualName(field.pdf417Name);
  const data: Pdf417ScanData = {
    ...manualName,
    ...field.pdf417Data,
    dob: field.pdf417Data?.dob ?? field.pdf417Dob ?? null,
  };
  const fieldStatuses: Pdf417Resolution['fieldStatuses'] = {};
  const messages: string[] = [];

  for (const key of LEGACY_PDF417_KEY_ORDER) {
    const ref = field.pdf417FieldMappings?.[key];
    if (!ref) continue;
    const resolved = resolveDependencyRef(ref, fields, field.id);
    fieldStatuses[key] = resolved;
    if (resolved.status === 'ready') {
      data[key] = resolved.value;
    } else if (resolved.status === 'missing') {
      messages.push(`${LEGACY_PDF417_KEY_LABELS[key]} source field is missing.`);
      data[key] = null;
    } else {
      messages.push(`${LEGACY_PDF417_KEY_LABELS[key]} source field is blank.`);
      data[key] = null;
    }
  }

  return {
    data,
    fieldStatuses,
    messages,
    isComplete: !messages.length,
  };
}

// ---------- Unified barcodeClasses resolver ----------

export type ResolvedBarcodeClass = {
  class: BarcodeClass;
  status: 'ready' | 'manual' | 'missing' | 'blank';
  value: string;
  sourceField: PdfField | null;
  message?: string;
};

export type BarcodeClassesResolution = {
  classes: ResolvedBarcodeClass[];
  messages: string[];
  isReady: boolean;
};

function makeClassId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `class_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function resolveBarcodeClasses(
  field: PdfField,
  fields: PdfField[],
): BarcodeClassesResolution {
  const list = field.barcodeClasses ?? [];
  const messages: string[] = [];
  const resolved: ResolvedBarcodeClass[] = list.map((entry) => {
    if (entry.mode === 'field') {
      const dependency = resolveDependencyRef(entry.fieldRef ?? null, fields, field.id);
      if (dependency.status === 'missing') {
        const message = `${entry.label || 'Class'}: source field missing.`;
        messages.push(message);
        return {
          class: entry,
          status: 'missing',
          value: '',
          sourceField: null,
          message,
        };
      }
      if (dependency.status === 'blank') {
        const message = `${entry.label || 'Class'}: source field is blank.`;
        messages.push(message);
        return {
          class: entry,
          status: 'blank',
          value: '',
          sourceField: dependency.field,
          message,
        };
      }
      return {
        class: entry,
        status: 'ready',
        value: dependency.value,
        sourceField: dependency.field,
      };
    }
    const value = cleanText(entry.manualValue);
    if (!value) {
      const message = `${entry.label || 'Class'}: manual value is blank.`;
      messages.push(message);
      return {
        class: entry,
        status: 'blank',
        value: '',
        sourceField: null,
        message,
      };
    }
    return {
      class: entry,
      status: 'manual',
      value,
      sourceField: null,
    };
  });
  return {
    classes: resolved,
    messages,
    isReady: list.length > 0 && resolved.every((entry) => entry.status === 'ready' || entry.status === 'manual'),
  };
}

/**
 * Synthesize barcodeClasses from legacy storage (pdf417FieldMappings /
 * pdf417Data / pdf417Name / pdf417Dob / barcodeSourceField / qrSourceField /
 * value). Returns null when the field is up to date or has no convertible data.
 */
export function legacyBarcodeClassesFor(field: PdfField): BarcodeClass[] | null {
  if (Array.isArray(field.barcodeClasses)) return null;
  if (field.type === 'pdf417') {
    const classes: BarcodeClass[] = [];
    const mappings = field.pdf417FieldMappings ?? null;
    const data = field.pdf417Data ?? null;
    const orderedKeys: Pdf417DependencyKey[] = [
      'firstName', 'middleName', 'lastName',
      'streetAddress', 'city', 'state', 'zip',
      'dob', 'sex', 'eyeColor', 'height',
      'customerId', 'issueDate', 'expirationDate',
    ];
    for (const key of orderedKeys) {
      const ref = mappings?.[key];
      const manual = cleanText(data?.[key]);
      if (ref) {
        classes.push({
          id: makeClassId(),
          label: LEGACY_PDF417_KEY_LABELS[key],
          mode: 'field',
          fieldRef: ref,
        });
      } else if (manual) {
        classes.push({
          id: makeClassId(),
          label: LEGACY_PDF417_KEY_LABELS[key],
          mode: 'manual',
          manualValue: manual,
        });
      }
    }
    // Convert legacy free-text pdf417Name/pdf417Dob into classes if not yet covered.
    const haveName = classes.some((c) => c.label === LEGACY_PDF417_KEY_LABELS.firstName);
    if (!haveName && cleanText(field.pdf417Name)) {
      classes.push({
        id: makeClassId(),
        label: 'Name',
        mode: 'manual',
        manualValue: cleanText(field.pdf417Name),
      });
    }
    const haveDob = classes.some((c) => c.label === LEGACY_PDF417_KEY_LABELS.dob);
    if (!haveDob && cleanText(field.pdf417Dob)) {
      classes.push({
        id: makeClassId(),
        label: 'DOB',
        mode: 'manual',
        manualValue: cleanText(field.pdf417Dob),
      });
    }
    return classes;
  }
  if (field.type === 'barcode') {
    if (field.barcodeSourceField) {
      return [{
        id: makeClassId(),
        label: 'Value',
        mode: 'field',
        fieldRef: field.barcodeSourceField,
      }];
    }
    const manual = cleanText(field.value);
    if (manual) {
      return [{
        id: makeClassId(),
        label: 'Value',
        mode: 'manual',
        manualValue: manual,
      }];
    }
    return [];
  }
  if (field.type === 'qr') {
    if (field.qrSourceField) {
      return [{
        id: makeClassId(),
        label: 'Value',
        mode: 'field',
        fieldRef: field.qrSourceField,
      }];
    }
    const manual = cleanText(field.value);
    if (manual) {
      return [{
        id: makeClassId(),
        label: 'Value',
        mode: 'manual',
        manualValue: manual,
      }];
    }
    return [];
  }
  return null;
}

/**
 * Returns a field with barcodeClasses populated from legacy fields when needed.
 * Pure: returns the same reference when no migration was required.
 */
export function migrateFieldBarcodeClasses(field: PdfField): PdfField {
  if (field.type !== 'pdf417' && field.type !== 'barcode' && field.type !== 'qr') return field;
  const migrated = legacyBarcodeClassesFor(field);
  if (migrated === null) return field;
  return { ...field, barcodeClasses: migrated };
}

export function generateBarcodeClassId(): string {
  return makeClassId();
}
