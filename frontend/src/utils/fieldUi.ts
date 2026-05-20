/**
 * UI labels and options for field types and editor create tools.
 */
import type { CreateTool, FieldType } from '../types';
import { CALCULATION_CREATE_TOOLS } from './calculationFields';

// Order matters for dropdown display.
export const NATIVE_FIELD_TYPES: FieldType[] = ['text', 'signature', 'checkbox', 'radio'];
export const DULLYPDF_ONLY_FIELD_TYPES: FieldType[] = ['image', 'pdf417', 'barcode', 'qr'];
export const FIELD_TYPES: FieldType[] = [...NATIVE_FIELD_TYPES, ...DULLYPDF_ONLY_FIELD_TYPES];

export const NATIVE_CREATE_TOOLS: CreateTool[] = [
  'text',
  'signature',
  'checkbox',
  'radio',
  'quick-radio',
];
export const DULLYPDF_ONLY_CREATE_TOOLS: CreateTool[] = ['image', 'pdf417', 'barcode', 'qr'];
export const CREATE_TOOLS: CreateTool[] = [...NATIVE_CREATE_TOOLS, ...DULLYPDF_ONLY_CREATE_TOOLS, ...CALCULATION_CREATE_TOOLS];

export function fieldTypeLabel(type: FieldType) {
  switch (type) {
    case 'text':
      return 'Text';
    case 'signature':
      return 'Signature';
    case 'checkbox':
      return 'Checkbox';
    case 'radio':
      return 'Radio';
    case 'image':
      return 'Image';
    case 'pdf417':
      return 'PDF417';
    case 'barcode':
      return '1D Barcode';
    case 'qr':
      return 'QR Code';
    default:
      return 'Field';
  }
}

export function createToolLabel(type: CreateTool) {
  switch (type) {
    case 'quick-radio':
      return 'Quick Radio';
    case 'bulk-text-style':
      return 'Bulk Style';
    case 'number-input':
      return 'Number Input';
    case 'calculated-output':
      return 'Calculated Output';
    default:
      return fieldTypeLabel(type);
  }
}
