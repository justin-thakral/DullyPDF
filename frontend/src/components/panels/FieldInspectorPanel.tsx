/**
 * Field inspector panel for editing geometry and metadata.
 */
import { useEffect, useState, type ChangeEvent as ReactChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ConfirmDialog } from '../ui/Dialog';
import type { CalculationSetupIntent } from '../features/CalculationSetupDialog';
import type {
  CreateTool,
  FieldFontChoice,
  FieldFontColorChoice,
  FieldFontColorOverride,
  FieldFontOverride,
  FieldFontSizeChoice,
  FieldFontSizeOverride,
  FieldRect,
  FieldTextAlignmentChoice,
  FieldTextAlignmentOverride,
  FieldType,
  PdfBase14FontName,
  PdfField,
  RadioGroup,
  RadioGroupSuggestion,
  RadioToolDraft,
} from '../../types';
import {
  DEFAULT_CUSTOM_FIELD_FONT_SIZE_PT,
  DEFAULT_FIELD_FONT_CHOICE,
  DEFAULT_FIELD_FONT_COLOR,
  DEFAULT_FIELD_FONT_SIZE_CHOICE,
  FIELD_TEXT_ALIGNMENT_CHOICES,
  MAX_FIELD_FONT_SIZE_PT,
  MIN_FIELD_FONT_SIZE_PT,
  PDF_BASE_14_FONT_OPTION_GROUPS,
  fieldFontColorChoiceLabel,
  fieldFontChoiceLabel,
  fieldFontSizeChoiceLabel,
  fieldTextAlignmentChoiceLabel,
  isPdfBase14FontName,
  sanitizeFieldFontColorChoice,
  sanitizeFieldFontColorOverride,
  sanitizeFieldFontSizeOverride,
  sanitizeFieldTextAlignmentOverride,
  sanitizeGlobalFieldTextAlignment,
} from '../../utils/fieldFonts';
import { getMinFieldSize } from '../../utils/fields';
import {
  MAX_ARROW_KEY_MOVE_STEP,
  MIN_ARROW_KEY_MOVE_STEP,
  sanitizeArrowKeyMoveStep,
} from '../../utils/fieldMovement';
import {
  DULLYPDF_ONLY_CREATE_TOOLS,
  DULLYPDF_ONLY_FIELD_TYPES,
  NATIVE_CREATE_TOOLS,
  NATIVE_FIELD_TYPES,
  createToolLabel,
  fieldTypeLabel,
} from '../../utils/fieldUi';
import {
  isLegacyRadioGroupSuggestion,
  radioGroupSuggestionConfidence,
  radioGroupSuggestionConfidenceTier,
  shouldAutoApplyRadioGroupSuggestion,
} from '../../utils/radioGroupSuggestions';
import { openUsageDocsWindow, USAGE_DOCS_ROUTES } from '../../utils/usageDocs';
import { IMAGE_ACCEPT, readImageFileAsDataUrl } from '../../utils/images';
import {
  CALCULATION_CREATE_TOOLS,
  calculationFieldsEnabled,
  calculationRoleLabel,
  formatFormulaForDisplay,
} from '../../utils/calculationFields';
import {
  readPanelDisclosureState,
  writePanelDisclosureState,
} from '../../utils/panelDisclosureState';

const EDITOR_DESCRIPTION_DISCLOSURE_KEY = 'field-editor-description';

type InspectorDraft = {
  name: string;
  page: string;
  x: string;
  y: string;
  width: string;
  height: string;
};

type BulkTextStyleProperty = 'fontName' | 'fontSize' | 'fontColor' | 'textAlign';
type BulkFontSizeMode = 'global' | 'auto' | 'custom';
type BulkFontColorMode = 'global' | 'custom';

function fieldTextAlignmentUpdateValue(
  value: FieldTextAlignmentOverride,
): FieldTextAlignmentOverride | undefined {
  return value === 'global' ? undefined : value;
}

type FieldInspectorPanelProps = {
  fields: PdfField[];
  selectedFieldId: string | null;
  selectedField?: PdfField | null;
  radioGroups: RadioGroup[];
  selectedRadioSuggestion: RadioGroupSuggestion | null;
  globalFieldFont: FieldFontChoice;
  globalFieldFontSize: FieldFontSizeChoice;
  globalFieldFontColor: FieldFontColorChoice;
  globalFieldAlignment: FieldTextAlignmentChoice;
  activeCreateTool: CreateTool | null;
  radioToolDraft: RadioToolDraft | null;
  pendingQuickRadioFields: PdfField[];
  pendingBulkTextStyleFields: PdfField[];
  arrowKeyMoveEnabled: boolean;
  arrowKeyMoveStep: number;
  onUpdateField: (fieldId: string, updates: Partial<PdfField>) => void;
  onSetFieldType: (fieldId: string, type: FieldType) => void;
  onOpenCalculationSetup: (fieldId: string, intent?: CalculationSetupIntent) => void;
  onOpenBarcodeSetup: (fieldId: string) => void;
  onUpdateFieldDraft: (fieldId: string, updates: Partial<PdfField>) => void;
  onDeleteField: (fieldId: string) => void;
  onDeleteAllFields: () => void;
  onCreateToolChange: (type: CreateTool | null) => void;
  onUpdateRadioToolDraft: (updates: Partial<RadioToolDraft>) => void;
  onApplyPendingQuickRadioSelection: () => void;
  onCancelPendingQuickRadioSelection: () => void;
  onRemovePendingQuickRadioField: (fieldId: string) => void;
  onApplyPendingBulkTextStyleSelection: (updates: Partial<PdfField>) => void;
  onCancelPendingBulkTextStyleSelection: () => void;
  onRemovePendingBulkTextStyleField: (fieldId: string) => void;
  onRenameRadioGroup: (groupId: string, updates: { label?: string; key?: string }) => void;
  onUpdateRadioFieldOption: (fieldId: string, updates: { label?: string; key?: string }) => void;
  onMoveRadioFieldToGroup: (fieldId: string, targetGroup: RadioGroup) => void;
  onReorderRadioField: (fieldId: string, direction: 'up' | 'down') => void;
  onDissolveRadioGroup: (groupId: string) => void;
  onApplyRadioSuggestion: (suggestion: RadioGroupSuggestion) => void;
  onDismissRadioSuggestion: (suggestionId: string) => void;
  onArrowKeyMoveEnabledChange: (enabled: boolean) => void;
  onArrowKeyMoveStepChange: (step: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onBeginFieldChange: () => void;
  onCommitFieldChange: () => void;
  onBlockedAction?: (message: string) => void;
};

/**
 * Render editable metadata and geometry controls for the selected field.
 */
export function FieldInspectorPanel({
  fields,
  selectedFieldId,
  selectedField,
  radioGroups,
  selectedRadioSuggestion,
  globalFieldFont,
  globalFieldFontSize,
  globalFieldFontColor,
  globalFieldAlignment,
  activeCreateTool,
  radioToolDraft,
  pendingQuickRadioFields,
  pendingBulkTextStyleFields,
  arrowKeyMoveEnabled,
  arrowKeyMoveStep,
  onUpdateField,
  onSetFieldType,
  onOpenCalculationSetup,
  onOpenBarcodeSetup,
  onDeleteField,
  onDeleteAllFields,
  onCreateToolChange,
  onUpdateRadioToolDraft,
  onApplyPendingQuickRadioSelection,
  onCancelPendingQuickRadioSelection,
  onRemovePendingQuickRadioField,
  onApplyPendingBulkTextStyleSelection,
  onCancelPendingBulkTextStyleSelection,
  onRemovePendingBulkTextStyleField,
  onRenameRadioGroup,
  onUpdateRadioFieldOption,
  onMoveRadioFieldToGroup,
  onReorderRadioField,
  onDissolveRadioGroup,
  onApplyRadioSuggestion,
  onDismissRadioSuggestion,
  onArrowKeyMoveEnabledChange,
  onArrowKeyMoveStepChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onBeginFieldChange,
  onCommitFieldChange,
  onBlockedAction,
}: FieldInspectorPanelProps) {
  const guardClick = (blocked: boolean, reason: string, action: () => void) => {
    if (blocked) { onBlockedAction?.(reason); return; }
    action();
  };
  const selected = selectedField ?? fields.find((field) => field.id === selectedFieldId) ?? null;
  const calculationsEnabled = calculationFieldsEnabled();
  const selectedCalculationRole = selected?.calculation?.role;
  const selectedCalculationLabel = selectedCalculationRole
    ? calculationRoleLabel(selectedCalculationRole)
    : null;
  const selectedCalculationFormula = selected?.calculation?.formula
    ? formatFormulaForDisplay(selected.calculation.formula, fields)
    : null;
  const selectedCalculationDependencies = selected?.calculation?.dependencies
    ?.map((fieldId) => fields.find((field) => field.id === fieldId)?.name || 'Missing field')
    .filter(Boolean) ?? [];
  const selectedCanConvertToCalculation = Boolean(calculationsEnabled && selected && selected.type === 'text');
  const selectedMinSize = selected ? getMinFieldSize(selected.type) : getMinFieldSize('text');
  const selectedId = selected?.id ?? null;
  const selectedName = selected?.name ?? null;
  const selectedPage = selected?.page ?? null;
  const selectedRectX = selected?.rect.x ?? null;
  const selectedRectY = selected?.rect.y ?? null;
  const selectedRectWidth = selected?.rect.width ?? null;
  const selectedRectHeight = selected?.rect.height ?? null;
  const [draft, setDraft] = useState<InspectorDraft | null>(null);
  const [arrowKeyMoveStepDraft, setArrowKeyMoveStepDraft] = useState(String(arrowKeyMoveStep));
  const [radioGroupLabelDraft, setRadioGroupLabelDraft] = useState('');
  const [radioGroupKeyDraft, setRadioGroupKeyDraft] = useState('');
  const [radioOptionLabelDraft, setRadioOptionLabelDraft] = useState('');
  const [radioOptionKeyDraft, setRadioOptionKeyDraft] = useState('');
  const [radioMoveGroupId, setRadioMoveGroupId] = useState('');
  const [fieldFontSizeDraft, setFieldFontSizeDraft] = useState('');
  const [bulkTextStyleProperty, setBulkTextStyleProperty] = useState<BulkTextStyleProperty>('fontName');
  const [bulkFontValue, setBulkFontValue] = useState<FieldFontOverride>('global');
  const [bulkFontSizeMode, setBulkFontSizeMode] = useState<BulkFontSizeMode>('global');
  const [bulkFontSizeDraft, setBulkFontSizeDraft] = useState(String(DEFAULT_CUSTOM_FIELD_FONT_SIZE_PT));
  const [bulkFontColorMode, setBulkFontColorMode] = useState<BulkFontColorMode>('global');
  const [bulkFontColorDraft, setBulkFontColorDraft] = useState(
    sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR),
  );
  const [bulkTextAlignmentValue, setBulkTextAlignmentValue] =
    useState<FieldTextAlignmentOverride>('global');
  const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
  const [editorDescriptionOpen, setEditorDescriptionOpen] = useState(() => (
    readPanelDisclosureState(EDITOR_DESCRIPTION_DISCLOSURE_KEY)
  ));

  useEffect(() => {
    if (selectedId === null || selectedName === null || selectedPage === null) {
      setDraft(null);
      return;
    }
    setDraft({
      name: selectedName,
      page: String(selectedPage),
      x: String(Math.round(selectedRectX ?? 0)),
      y: String(Math.round(selectedRectY ?? 0)),
      width: String(Math.round(selectedRectWidth ?? 0)),
      height: String(Math.round(selectedRectHeight ?? 0)),
    });
  }, [
    selectedId,
    selectedName,
    selectedPage,
    selectedRectX,
    selectedRectY,
    selectedRectWidth,
    selectedRectHeight,
  ]);

  useEffect(() => {
    setArrowKeyMoveStepDraft(String(arrowKeyMoveStep));
  }, [arrowKeyMoveStep]);

  const selectedRadioGroup =
    selected?.type === 'radio' && selected.radioGroupId
      ? radioGroups.find((group) => group.id === selected.radioGroupId) ?? null
      : null;
  const selectedRadioSuggestionConfidence = selectedRadioSuggestion
    ? radioGroupSuggestionConfidence(selectedRadioSuggestion)
    : undefined;
  const selectedRadioSuggestionConfidenceTier = selectedRadioSuggestion
    ? radioGroupSuggestionConfidenceTier(selectedRadioSuggestion)
    : null;
  const selectedRadioSuggestionAutoApplies = selectedRadioSuggestion
    ? shouldAutoApplyRadioGroupSuggestion(selectedRadioSuggestion)
    : false;
  const selectedRadioIndex = selectedRadioGroup
    ? selectedRadioGroup.options.findIndex((option) => option.fieldId === selected?.id)
    : -1;
  const otherRadioGroups = selectedRadioGroup
    ? radioGroups.filter((group) => group.id !== selectedRadioGroup.id)
    : radioGroups;
  const canEditSelectedFont = selected?.type === 'text';
  const selectedFontValue: FieldFontOverride = isPdfBase14FontName(selected?.fontName)
    ? selected.fontName
    : 'global';
  const globalFontLabel = globalFieldFont === DEFAULT_FIELD_FONT_CHOICE
    ? 'Default'
    : fieldFontChoiceLabel(globalFieldFont);
  const selectedFontSizeValue =
    typeof selected?.fontSize === 'number'
      ? 'custom'
      : selected?.fontSize === DEFAULT_FIELD_FONT_SIZE_CHOICE
        ? DEFAULT_FIELD_FONT_SIZE_CHOICE
        : 'global';
  const globalFontSizeLabel = fieldFontSizeChoiceLabel(globalFieldFontSize);
  const selectedFontColorValue =
    typeof selected?.fontColor === 'string' && selected.fontColor !== 'global'
      ? 'custom'
      : 'global';
  const selectedCustomFontColorValue =
    selectedFontColorValue === 'custom'
      ? sanitizeFieldFontColorChoice(selected?.fontColor, DEFAULT_FIELD_FONT_COLOR)
      : sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR);
  const globalFontColorLabel = fieldFontColorChoiceLabel(globalFieldFontColor);
  const selectedTextAlignmentValue = sanitizeFieldTextAlignmentOverride(selected?.textAlign, 'global');
  const globalTextAlignmentLabel = fieldTextAlignmentChoiceLabel(
    sanitizeGlobalFieldTextAlignment(globalFieldAlignment),
  );
  useEffect(() => {
    if (!selectedRadioGroup || selected?.type !== 'radio') {
      setRadioGroupLabelDraft('');
      setRadioGroupKeyDraft('');
      setRadioOptionLabelDraft('');
      setRadioOptionKeyDraft('');
      setRadioMoveGroupId('');
      return;
    }
    setRadioGroupLabelDraft(selectedRadioGroup.label);
    setRadioGroupKeyDraft(selectedRadioGroup.key);
    setRadioOptionLabelDraft(selected.radioOptionLabel || selected.name);
    setRadioOptionKeyDraft(selected.radioOptionKey || selected.name);
    setRadioMoveGroupId('');
  }, [
    selected?.id,
    selected?.name,
    selected?.radioOptionKey,
    selected?.radioOptionLabel,
    selected?.type,
    selectedRadioGroup,
  ]);

  useEffect(() => {
    setFieldFontSizeDraft(typeof selected?.fontSize === 'number' ? String(selected.fontSize) : '');
  }, [selected?.id, selected?.fontSize]);

  useEffect(() => {
    if (bulkFontColorMode === 'custom') return;
    setBulkFontColorDraft(sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR));
  }, [bulkFontColorMode, globalFieldFontColor]);

  /**
   * Patch rect properties while keeping the rest of the geometry intact.
   */
  const updateDraftField = (key: keyof InspectorDraft, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const normalizeRect = (patch: Partial<FieldRect>) => {
    if (!selected) return null;
    return { ...selected.rect, ...patch };
  };

  const commitName = () => {
    if (!selected || !draft) return;
    if (draft.name !== selected.name) {
      onUpdateField(selected.id, { name: draft.name });
    }
  };

  const commitPage = () => {
    if (!selected || !draft) return;
    const nextPage = Math.max(1, Math.round(Number(draft.page) || 1));
    setDraft((prev) => (prev ? { ...prev, page: String(nextPage) } : prev));
    if (nextPage !== selected.page) {
      onUpdateField(selected.id, { page: nextPage });
    }
  };

  const commitRect = (axis: 'x' | 'y' | 'width' | 'height') => {
    if (!selected || !draft) return;
    let nextRect: FieldRect | null = null;
    if (axis === 'x') {
      nextRect = normalizeRect({ x: Number(draft.x) || 0 });
    } else if (axis === 'y') {
      nextRect = normalizeRect({ y: Number(draft.y) || 0 });
    } else if (axis === 'width') {
      nextRect = normalizeRect({ width: Math.max(selectedMinSize, Number(draft.width) || 0) });
    } else if (axis === 'height') {
      nextRect = normalizeRect({ height: Math.max(selectedMinSize, Number(draft.height) || 0) });
    }
    if (!nextRect) return;
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        x: String(Math.round(nextRect.x)),
        y: String(Math.round(nextRect.y)),
        width: String(Math.round(nextRect.width)),
        height: String(Math.round(nextRect.height)),
      };
    });
    if (
      nextRect.x !== selected.rect.x ||
      nextRect.y !== selected.rect.y ||
      nextRect.width !== selected.rect.width ||
      nextRect.height !== selected.rect.height
    ) {
      onUpdateField(selected.id, { rect: nextRect });
    }
  };

  const beginFieldEdit = () => {
    if (!selected) return;
    onBeginFieldChange();
  };

  const commitFieldEdit = (commit: () => void) => {
    if (!selected) return;
    commit();
    onCommitFieldChange();
  };

  const handleFieldFontChange = (value: string) => {
    if (!selected || !canEditSelectedFont) return;
    const nextFont: FieldFontOverride = value === 'global'
      ? 'global'
      : isPdfBase14FontName(value)
        ? (value as PdfBase14FontName)
        : 'global';
    if (nextFont !== selected.fontName) {
      onUpdateField(selected.id, { fontName: nextFont });
    }
  };

  const handleFieldFontSizeModeChange = (value: string) => {
    if (!selected || !canEditSelectedFont) return;
    const nextFontSize: FieldFontSizeOverride =
      value === 'custom'
        ? typeof selected.fontSize === 'number'
          ? selected.fontSize
          : DEFAULT_CUSTOM_FIELD_FONT_SIZE_PT
        : value === DEFAULT_FIELD_FONT_SIZE_CHOICE
          ? DEFAULT_FIELD_FONT_SIZE_CHOICE
          : 'global';
    if (nextFontSize !== selected.fontSize) {
      onUpdateField(selected.id, { fontSize: nextFontSize });
    }
  };

  const handleFieldFontSizeChange = (value: string) => {
    setFieldFontSizeDraft(value);
  };

  const commitFieldFontSizeChange = () => {
    if (!selected || !canEditSelectedFont) return;
    const fallback =
      typeof selected.fontSize === 'number'
        ? selected.fontSize
        : DEFAULT_CUSTOM_FIELD_FONT_SIZE_PT;
    const rawFontSizeDraft = fieldFontSizeDraft.trim();
    const nextFontSize =
      rawFontSizeDraft.length === 0
        ? fallback
        : sanitizeFieldFontSizeOverride(rawFontSizeDraft, fallback);
    setFieldFontSizeDraft(typeof nextFontSize === 'number' ? String(nextFontSize) : String(fallback));
    if (typeof nextFontSize === 'number' && nextFontSize !== selected.fontSize) {
      onUpdateField(selected.id, { fontSize: nextFontSize });
    }
  };

  const handleFieldFontColorModeChange = (value: string) => {
    if (!selected || !canEditSelectedFont) return;
    const nextFontColor: FieldFontColorOverride =
      value === 'custom'
        ? selected.fontColor && selected.fontColor !== 'global'
          ? sanitizeFieldFontColorChoice(selected.fontColor, DEFAULT_FIELD_FONT_COLOR)
          : sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR)
        : 'global';
    if (nextFontColor !== selected.fontColor) {
      onUpdateField(selected.id, { fontColor: nextFontColor });
    }
  };

  const handleFieldFontColorChange = (value: string) => {
    if (!selected || !canEditSelectedFont) return;
    const fallback =
      selected.fontColor && selected.fontColor !== 'global'
        ? sanitizeFieldFontColorChoice(selected.fontColor, DEFAULT_FIELD_FONT_COLOR)
        : sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR);
    const nextFontColor = sanitizeFieldFontColorOverride(value, fallback);
    if (nextFontColor !== 'global' && nextFontColor !== selected.fontColor) {
      onUpdateField(selected.id, { fontColor: nextFontColor });
    }
  };

  const handleFieldTextAlignmentChange = (value: string) => {
    if (!selected || !canEditSelectedFont) return;
    const nextAlignment: FieldTextAlignmentOverride = sanitizeFieldTextAlignmentOverride(value, 'global');
    const nextStoredAlignment = fieldTextAlignmentUpdateValue(nextAlignment);
    if (nextStoredAlignment !== selected.textAlign) {
      onUpdateField(selected.id, { textAlign: nextStoredAlignment });
    }
  };

  const handleBulkFontChange = (value: string) => {
    setBulkFontValue(value === 'global' || !isPdfBase14FontName(value) ? 'global' : value);
  };

  const handleBulkFontColorChange = (value: string) => {
    const fallback = sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR);
    const nextColor = sanitizeFieldFontColorOverride(value, fallback);
    setBulkFontColorDraft(nextColor === 'global' ? fallback : nextColor);
  };

  const handleBulkTextAlignmentChange = (value: string) => {
    setBulkTextAlignmentValue(sanitizeFieldTextAlignmentOverride(value, 'global'));
  };

  const handleApplyBulkTextStyleSelection = () => {
    const updates: Partial<PdfField> = {};
    if (bulkTextStyleProperty === 'fontName') {
      updates.fontName = bulkFontValue;
    } else if (bulkTextStyleProperty === 'fontSize') {
      if (bulkFontSizeMode === 'custom') {
        const fallback = DEFAULT_CUSTOM_FIELD_FONT_SIZE_PT;
        const nextFontSize = sanitizeFieldFontSizeOverride(
          bulkFontSizeDraft.trim() || String(fallback),
          fallback,
        );
        const normalizedFontSize = typeof nextFontSize === 'number' ? nextFontSize : fallback;
        setBulkFontSizeDraft(String(normalizedFontSize));
        updates.fontSize = normalizedFontSize;
      } else {
        updates.fontSize = bulkFontSizeMode;
      }
    } else if (bulkTextStyleProperty === 'fontColor') {
      if (bulkFontColorMode === 'custom') {
        const fallback = sanitizeFieldFontColorChoice(globalFieldFontColor, DEFAULT_FIELD_FONT_COLOR);
        const nextFontColor = sanitizeFieldFontColorOverride(bulkFontColorDraft, fallback);
        const normalizedFontColor = nextFontColor === 'global' ? fallback : nextFontColor;
        setBulkFontColorDraft(normalizedFontColor);
        updates.fontColor = normalizedFontColor;
      } else {
        updates.fontColor = 'global';
      }
    } else {
      updates.textAlign = fieldTextAlignmentUpdateValue(bulkTextAlignmentValue);
    }
    onApplyPendingBulkTextStyleSelection(updates);
  };

  const handleImageFileChange = async (event: ReactChangeEvent<HTMLInputElement>) => {
    if (!selected || selected.type !== 'image') return;
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    onBeginFieldChange();
    try {
      const image = await readImageFileAsDataUrl(file);
      onUpdateField(selected.id, { ...image, value: null });
    } catch (error) {
      onBlockedAction?.(error instanceof Error ? error.message : 'Unable to read this image file.');
    } finally {
      onCommitFieldChange();
    }
  };

  const clearSelectedImage = () => {
    if (!selected || selected.type !== 'image') return;
    onUpdateField(selected.id, {
      imageDataUrl: null,
      imageMimeType: null,
      imageName: null,
      value: null,
    });
  };

  const handleNumberInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.currentTarget.blur(); // onBlur handler will commitFieldEdit
  };

  const commitArrowKeyMoveStep = () => {
    const nextStep = sanitizeArrowKeyMoveStep(arrowKeyMoveStepDraft, arrowKeyMoveStep);
    setArrowKeyMoveStepDraft(String(nextStep));
    if (nextStep !== arrowKeyMoveStep) {
      onArrowKeyMoveStepChange(nextStep);
    }
  };

  const handleArrowKeyMoveStepKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitArrowKeyMoveStep();
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setArrowKeyMoveStepDraft(String(arrowKeyMoveStep));
      event.currentTarget.blur();
    }
  };

  const commitRadioGroupDraft = () => {
    if (!selectedRadioGroup) return;
    const nextLabel = radioGroupLabelDraft.trim() || selectedRadioGroup.label;
    const nextKey = radioGroupKeyDraft.trim() || selectedRadioGroup.key;
    if (nextLabel === selectedRadioGroup.label && nextKey === selectedRadioGroup.key) {
      setRadioGroupLabelDraft(nextLabel);
      setRadioGroupKeyDraft(nextKey);
      return;
    }
    setRadioGroupLabelDraft(nextLabel);
    setRadioGroupKeyDraft(nextKey);
    onRenameRadioGroup(selectedRadioGroup.id, {
      label: nextLabel,
      key: nextKey,
    });
  };

  const commitRadioOptionDraft = () => {
    if (!selected || selected.type !== 'radio') return;
    const nextLabel = radioOptionLabelDraft.trim() || selected.radioOptionLabel || selected.name;
    const nextKey = radioOptionKeyDraft.trim() || selected.radioOptionKey || selected.name;
    if (nextLabel === selected.radioOptionLabel && nextKey === selected.radioOptionKey) {
      setRadioOptionLabelDraft(nextLabel);
      setRadioOptionKeyDraft(nextKey);
      return;
    }
    setRadioOptionLabelDraft(nextLabel);
    setRadioOptionKeyDraft(nextKey);
    onUpdateRadioFieldOption(selected.id, {
      label: nextLabel,
      key: nextKey,
    });
  };

  const handleMoveRadioGroup = (groupId: string) => {
    setRadioMoveGroupId(groupId);
    if (!selected || selected.type !== 'radio' || !groupId) {
      return;
    }
    const targetGroup = radioGroups.find((group) => group.id === groupId);
    if (!targetGroup) {
      return;
    }
    onMoveRadioFieldToGroup(selected.id, targetGroup);
  };

  const handleDeleteAllFieldsConfirm = () => {
    onDeleteAllFields();
    setDeleteAllDialogOpen(false);
  };

  const toggleEditorDescription = () => {
    setEditorDescriptionOpen((open) => {
      const nextOpen = !open;
      writePanelDisclosureState(EDITOR_DESCRIPTION_DISCLOSURE_KEY, nextOpen);
      return nextOpen;
    });
  };

  return (
    <>
      <aside className="panel panel--inspector">
        <div className="panel__header panel__header--stacked">
          <div className="panel__header-row">
            <div className="panel__header-copy">
              <h2>
                <button
                  type="button"
                  className="panel-title-toggle"
                  aria-expanded={editorDescriptionOpen}
                  aria-controls="field-editor-description"
                  onClick={toggleEditorDescription}
                >
                  Field Editor
                </button>
              </h2>
              {selected ? <p className="panel__status-text">Selected: {selected.name}</p> : null}
            </div>
            <button
              type="button"
              className="ui-button ui-button--ghost ui-button--compact panel__header-action"
              onClick={() => openUsageDocsWindow(USAGE_DOCS_ROUTES.editorWorkflow)}
              title="Open Editor Workflow usage docs in a new window"
            >
              Usage Docs
            </button>
          </div>
          <p
            id="field-editor-description"
            className="panel__micro panel-title-description"
            hidden={!editorDescriptionOpen}
          >
            Edit the selected field name, type, page, geometry, field-specific appearance, radio grouping,
            helper data, create tools, keyboard movement, and edit history.
          </p>
        </div>

        <div className="panel__body">
          <div className="panel__section">
            {!selected ? (
              <p className="panel__empty">No field selected.</p>
            ) : (
              <div className="inspector">
                <details className="panel-disclosure">
                  <summary className="panel-disclosure__summary">Field details</summary>
                  <p className="panel__micro panel-disclosure__body">
                    Change the selected field metadata, text appearance, and PDF-point geometry. Press Enter
                    or leave a numeric/text input to commit the edit.
                  </p>
                </details>
                <label className="panel__label" htmlFor="field-name">
                  Name
                </label>
                <input
                  id="field-name"
                  name="field-name"
                  className="panel__input"
                  value={draft?.name ?? selected.name}
                  onFocus={beginFieldEdit}
                  onBlur={() => commitFieldEdit(commitName)}
                  onChange={(event) => updateDraftField('name', event.target.value)}
                  onKeyDown={handleNumberInputKeyDown}
                />

                <div className="panel__row">
                  <label className="panel__label" htmlFor="field-type">
                    Type
                  </label>
                  <select
                    id="field-type"
                    name="field-type"
                    className="panel__select"
                    value={selected.type}
                    onChange={(event) => onSetFieldType(selected.id, event.target.value as FieldType)}
                  >
                    <optgroup label="Standard PDF fields">
                      {NATIVE_FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {fieldTypeLabel(type)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="DullyPDF-only fields">
                      {DULLYPDF_ONLY_FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {fieldTypeLabel(type)}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {selected.type === 'text' && calculationsEnabled ? (
                  <div className="panel__section panel__section--tight panel__section--divider">
                    <div className="panel__section-heading-row panel__section-heading-row--disclosure">
                      <details className="panel-disclosure panel-disclosure--heading">
                        <summary className="panel-disclosure__summary panel-disclosure__summary--section">
                          Calculation
                        </summary>
                        <p className="panel__micro panel-disclosure__body">
                          Use calculation setup for numeric inputs and formula outputs. Required and read-only
                          flags are stored with the text field and carry into generated PDFs.
                        </p>
                      </details>
                      {selectedCalculationLabel ? (
                        <span className="panel-status-badge">{selectedCalculationLabel}</span>
                      ) : null}
                    </div>
                    {selectedCalculationLabel ? (
                      <>
                        {selectedCalculationFormula ? (
                          <p className="panel__micro">Formula: {selectedCalculationFormula}</p>
                        ) : null}
                        {selectedCalculationDependencies.length ? (
                          <p className="panel__micro">Depends on: {selectedCalculationDependencies.join(', ')}</p>
                        ) : null}
                        {selected.calculation?.imported?.supported === false ? (
                          <p className="panel__micro panel__micro--warning">
                            Imported calculation metadata is locked until it is rebuilt in DullyPDF.
                          </p>
                        ) : null}
                        <div className="panel__action-grid">
                          <button
                            type="button"
                            className="ui-button ui-button--secondary ui-button--compact"
                            onClick={() => onOpenCalculationSetup(
                              selected.id,
                              selected.calculation?.role === 'external_imported_calculation' ? 'review_imported' : 'edit',
                            )}
                          >
                            Edit calculation setup
                          </button>
                          {selected.calculation?.role === 'external_imported_calculation' ? (
                            <button
                              type="button"
                              className="ui-button ui-button--ghost ui-button--compact"
                              onClick={() => onOpenCalculationSetup(selected.id, 'rebuild_imported')}
                            >
                              Rebuild in DullyPDF
                            </button>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                    <div className="panel__toggle-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(selected.required)}
                          onChange={(event) => onUpdateField(selected.id, { required: event.target.checked })}
                        />
                        Required
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={
                            selected.calculation?.role === 'calculated_output'
                            || selected.calculation?.role === 'calculated_intermediate'
                            || selected.calculation?.role === 'external_imported_calculation'
                            || Boolean(selected.readOnly)
                          }
                          disabled={
                            selected.calculation?.role === 'calculated_output'
                            || selected.calculation?.role === 'calculated_intermediate'
                            || selected.calculation?.role === 'external_imported_calculation'
                          }
                          onChange={(event) => onUpdateField(selected.id, { readOnly: event.target.checked })}
                        />
                        Read-only
                      </label>
                    </div>
                  </div>
                ) : null}

                <div className="panel__row">
                  <label className="panel__label" htmlFor="field-page">
                    Page
                  </label>
                  <input
                    id="field-page"
                    name="field-page"
                    className="panel__input"
                    type="number"
                    min={1}
                    value={draft?.page ?? String(selected.page)}
                    onWheel={(event) => event.currentTarget.blur()}
                    onFocus={beginFieldEdit}
                    onBlur={() => commitFieldEdit(commitPage)}
                    onChange={(event) => updateDraftField('page', event.target.value)}
                    onKeyDown={handleNumberInputKeyDown}
                  />
                </div>

                {canEditSelectedFont ? (
                  <>
                    <div className="panel__row">
                      <label className="panel__label" htmlFor="field-font">
                        Font
                      </label>
                      <select
                        id="field-font"
                        name="field-font"
                        className="panel__select"
                        value={selectedFontValue}
                        onChange={(event) => handleFieldFontChange(event.target.value)}
                      >
                        <option value="global">Use global ({globalFontLabel})</option>
                        {PDF_BASE_14_FONT_OPTION_GROUPS.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.advanced ? `${option.label} (symbol)` : option.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="panel__row">
                      <label className="panel__label" htmlFor="field-font-size">
                        Font size
                      </label>
                      <div className="panel__inline-control">
                        <select
                          id="field-font-size"
                          name="field-font-size"
                          className="panel__select"
                          value={selectedFontSizeValue}
                          onChange={(event) => handleFieldFontSizeModeChange(event.target.value)}
                        >
                          <option value="global">Use global ({globalFontSizeLabel})</option>
                          <option value="auto">Auto</option>
                          <option value="custom">Custom</option>
                        </select>
                        <input
                          id="field-font-size-custom"
                          name="field-font-size-custom"
                          className="panel__input panel__input--inline"
                          type="number"
                          min={MIN_FIELD_FONT_SIZE_PT}
                          max={MAX_FIELD_FONT_SIZE_PT}
                          step={0.5}
                          inputMode="decimal"
                          aria-label="Custom font size"
                          value={selectedFontSizeValue === 'custom' ? fieldFontSizeDraft : ''}
                          placeholder={globalFontSizeLabel}
                          disabled={selectedFontSizeValue !== 'custom'}
                          onFocus={beginFieldEdit}
                          onBlur={() => commitFieldEdit(commitFieldFontSizeChange)}
                          onChange={(event) => handleFieldFontSizeChange(event.target.value)}
                          onKeyDown={handleNumberInputKeyDown}
                        />
                      </div>
                    </div>

                    <div className="panel__row">
                      <label className="panel__label" htmlFor="field-font-color">
                        Font color
                      </label>
                      <div className="panel__inline-control panel__inline-control--color">
                        <select
                          id="field-font-color"
                          name="field-font-color"
                          className="panel__select"
                          value={selectedFontColorValue}
                          onChange={(event) => handleFieldFontColorModeChange(event.target.value)}
                        >
                          <option value="global">Use global ({globalFontColorLabel})</option>
                          <option value="custom">Custom</option>
                        </select>
                        <input
                          id="field-font-color-custom"
                          name="field-font-color-custom"
                          className="panel__color-input"
                          type="color"
                          aria-label="Custom font color"
                          value={selectedCustomFontColorValue}
                          disabled={selectedFontColorValue !== 'custom'}
                          onChange={(event) => handleFieldFontColorChange(event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="panel__row">
                      <label className="panel__label" htmlFor="field-text-alignment">
                        Alignment
                      </label>
                      <select
                        id="field-text-alignment"
                        name="field-text-alignment"
                        className="panel__select"
                        value={selectedTextAlignmentValue}
                        onChange={(event) => handleFieldTextAlignmentChange(event.target.value)}
                      >
                        <option value="global">Use global ({globalTextAlignmentLabel})</option>
                        {FIELD_TEXT_ALIGNMENT_CHOICES.map((alignment) => (
                          <option key={alignment} value={alignment}>
                            {fieldTextAlignmentChoiceLabel(alignment)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : null}

                <div className="panel__grid">
                  <div>
                    <label className="panel__label" htmlFor="field-x">
                      X
                    </label>
                    <input
                      id="field-x"
                      name="field-x"
                      className="panel__input"
                      type="number"
                      value={draft?.x ?? String(Math.round(selected.rect.x))}
                      onFocus={beginFieldEdit}
                      onBlur={() => commitFieldEdit(() => commitRect('x'))}
                      onChange={(event) => updateDraftField('x', event.target.value)}
                      onKeyDown={handleNumberInputKeyDown}
                    />
                  </div>
                  <div>
                    <label className="panel__label" htmlFor="field-y">
                      Y
                    </label>
                    <input
                      id="field-y"
                      name="field-y"
                      className="panel__input"
                      type="number"
                      value={draft?.y ?? String(Math.round(selected.rect.y))}
                      onFocus={beginFieldEdit}
                      onBlur={() => commitFieldEdit(() => commitRect('y'))}
                      onChange={(event) => updateDraftField('y', event.target.value)}
                      onKeyDown={handleNumberInputKeyDown}
                    />
                  </div>
                  <div>
                    <label className="panel__label" htmlFor="field-width">
                      Width
                    </label>
                    <input
                      id="field-width"
                      name="field-width"
                      className="panel__input"
                      type="number"
                      min={selectedMinSize}
                      value={draft?.width ?? String(Math.round(selected.rect.width))}
                      onFocus={beginFieldEdit}
                      onBlur={() => commitFieldEdit(() => commitRect('width'))}
                      onChange={(event) => updateDraftField('width', event.target.value)}
                      onKeyDown={handleNumberInputKeyDown}
                    />
                  </div>
                  <div>
                    <label className="panel__label" htmlFor="field-height">
                      Height
                    </label>
                    <input
                      id="field-height"
                      name="field-height"
                      className="panel__input"
                      type="number"
                      min={selectedMinSize}
                      value={draft?.height ?? String(Math.round(selected.rect.height))}
                      onFocus={beginFieldEdit}
                      onBlur={() => commitFieldEdit(() => commitRect('height'))}
                      onChange={(event) => updateDraftField('height', event.target.value)}
                      onKeyDown={handleNumberInputKeyDown}
                    />
                  </div>
                </div>

                <button
                  className="ui-button ui-button--danger ui-button--compact"
                  type="button"
                  onClick={() => onDeleteField(selected.id)}
                  title="Delete selected field (Delete/Backspace)"
                >
                  Delete field
                </button>

                {selected.type === 'image' ? (
                  <div className="panel__section panel__section--divider">
                    <details className="panel-disclosure">
                      <summary className="panel-disclosure__summary panel-disclosure__summary--section">Image</summary>
                      <p className="panel__micro panel-disclosure__body">
                        Attach the image that this helper field should place on the page when DullyPDF
                        materializes the template.
                      </p>
                    </details>
                    <label className="panel__label" htmlFor="field-image-file">
                      File
                    </label>
                    <input
                      id="field-image-file"
                      name="field-image-file"
                      className="panel__input"
                      type="file"
                      accept={IMAGE_ACCEPT}
                      onChange={handleImageFileChange}
                    />
                    {selected.imageDataUrl ? (
                      <div className="panel-image-preview">
                        <img src={selected.imageDataUrl} alt="" />
                        <span>{selected.imageName || 'Selected image'}</span>
                      </div>
                    ) : (
                      <p className="panel__micro">No image selected.</p>
                    )}
                    <button
                      className="ui-button ui-button--ghost ui-button--compact"
                      type="button"
                      onClick={() => guardClick(!selected.imageDataUrl, 'No image to clear.', clearSelectedImage)}
                      aria-disabled={!selected.imageDataUrl}
                    >
                      Clear image
                    </button>
                  </div>
                ) : null}

                {selected.type === 'pdf417' || selected.type === 'barcode' || selected.type === 'qr' ? (
                  <div className="panel__section panel__section--divider">
                    <details className="panel-disclosure">
                      <summary className="panel-disclosure__summary panel-disclosure__summary--section">
                        {selected.type === 'pdf417' ? 'PDF417'
                          : selected.type === 'barcode' ? '1D Barcode'
                          : 'QR Code'}
                      </summary>
                      <p className="panel__micro panel-disclosure__body">
                        Open setup to configure manual values or source-field dependencies for this
                        DullyPDF-only barcode helper.
                      </p>
                    </details>
                    <p className="panel__micro">
                      {(selected.barcodeClasses?.length ?? 0) > 0
                        ? `${selected.barcodeClasses?.length} class${(selected.barcodeClasses?.length ?? 0) === 1 ? '' : 'es'} configured.`
                        : 'No classes configured yet.'}
                    </p>
                    <button
                      type="button"
                      className="ui-button ui-button--ghost ui-button--compact"
                      onClick={() => onOpenBarcodeSetup(selected.id)}
                    >
                      Edit barcode classes…
                    </button>
                  </div>
                ) : null}

                {selected.type === 'radio' && selectedRadioGroup ? (
                  <div className="panel__section panel__section--divider">
                    <details className="panel-disclosure">
                      <summary className="panel-disclosure__summary panel-disclosure__summary--section">Radio Group</summary>
                      <p className="panel__micro panel-disclosure__body">
                        Edit the exported single-choice group key, user-facing labels, option order, or move
                        this radio option into another group.
                      </p>
                    </details>
                    <label className="panel__label" htmlFor="radio-group-label">
                      Group label
                    </label>
                    <input
                      id="radio-group-label"
                      name="radio-group-label"
                      className="panel__input"
                      value={radioGroupLabelDraft}
                      onFocus={beginFieldEdit}
                      onBlur={() => commitFieldEdit(commitRadioGroupDraft)}
                      onChange={(event) => setRadioGroupLabelDraft(event.target.value)}
                      onKeyDown={handleNumberInputKeyDown}
                    />
                    <label className="panel__label" htmlFor="radio-group-key">
                      Group key
                    </label>
                    <input
                      id="radio-group-key"
                      name="radio-group-key"
                      className="panel__input"
                      value={radioGroupKeyDraft}
                      onFocus={beginFieldEdit}
                      onBlur={() => commitFieldEdit(commitRadioGroupDraft)}
                      onChange={(event) => setRadioGroupKeyDraft(event.target.value)}
                      onKeyDown={handleNumberInputKeyDown}
                    />
                    <div className="panel__row">
                      <label className="panel__label" htmlFor="radio-move-group">
                        Move to group
                      </label>
                      <select
                        id="radio-move-group"
                        name="radio-move-group"
                        className="panel__select"
                        value={radioMoveGroupId}
                        onChange={(event) => handleMoveRadioGroup(event.target.value)}
                      >
                        <option value="">Current group</option>
                        {otherRadioGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="panel__label" htmlFor="radio-option-label">
                      Option label
                    </label>
                    <input
                      id="radio-option-label"
                      name="radio-option-label"
                      className="panel__input"
                      value={radioOptionLabelDraft}
                      onFocus={beginFieldEdit}
                      onBlur={() => commitFieldEdit(commitRadioOptionDraft)}
                      onChange={(event) => setRadioOptionLabelDraft(event.target.value)}
                      onKeyDown={handleNumberInputKeyDown}
                    />
                    <label className="panel__label" htmlFor="radio-option-key">
                      Option key
                    </label>
                    <input
                      id="radio-option-key"
                      name="radio-option-key"
                      className="panel__input"
                      value={radioOptionKeyDraft}
                      onFocus={beginFieldEdit}
                      onBlur={() => commitFieldEdit(commitRadioOptionDraft)}
                      onChange={(event) => setRadioOptionKeyDraft(event.target.value)}
                      onKeyDown={handleNumberInputKeyDown}
                    />
                    <div className="panel__action-grid">
                      <button
                        className="ui-button ui-button--ghost ui-button--compact"
                        type="button"
                        onClick={() => guardClick(selectedRadioIndex <= 0, 'This option is already at the top of the group.', () => onReorderRadioField(selected.id, 'up'))}
                        aria-disabled={selectedRadioIndex <= 0}
                      >
                        Move up
                      </button>
                      <button
                        className="ui-button ui-button--ghost ui-button--compact"
                        type="button"
                        onClick={() => guardClick(selectedRadioIndex < 0 || selectedRadioIndex >= selectedRadioGroup.options.length - 1, 'This option is already at the bottom of the group.', () => onReorderRadioField(selected.id, 'down'))}
                        aria-disabled={selectedRadioIndex < 0 || selectedRadioIndex >= selectedRadioGroup.options.length - 1}
                      >
                        Move down
                      </button>
                    </div>
                    <button
                      className="ui-button ui-button--danger ui-button--compact"
                      type="button"
                      onClick={() => onDissolveRadioGroup(selectedRadioGroup.id)}
                    >
                      Dissolve group to checkboxes
                    </button>
                  </div>
                ) : null}

                {selectedRadioSuggestion ? (
                  <div className="panel__section panel__section--divider">
                    <details className="panel-disclosure">
                      <summary className="panel-disclosure__summary panel-disclosure__summary--section">
                        OpenAI Radio Suggestion
                      </summary>
                      <p className="panel__micro panel-disclosure__body">
                        Review the suggested checkbox cluster before converting it into an explicit radio
                        group. Applying the suggestion changes the selected fields from checkboxes to radio
                        options.
                      </p>
                    </details>
                    <p className="panel__micro">
                      Suggested {selectedRadioSuggestion.groupLabel} radio group with {selectedRadioSuggestion.suggestedFields.length} options.
                    </p>
                    <div className="panel__list panel__list--compact">
                      {selectedRadioSuggestion.suggestedFields.map((option) => (
                        <div key={`${selectedRadioSuggestion.id}:${option.fieldId || option.fieldName}`} className="panel-selection-row">
                          <span>{option.optionLabel}</span>
                          <span className="panel__micro">{option.fieldName}</span>
                        </div>
                      ))}
                    </div>
                    {selectedRadioSuggestion.selectionReason ? (
                      <p className="panel__micro">
                        Pattern: {selectedRadioSuggestion.selectionReason}
                      </p>
                    ) : null}
                    {typeof selectedRadioSuggestionConfidence === 'number' ? (
                      <p className="panel__micro">
                        Confidence: {Math.round(selectedRadioSuggestionConfidence * 100)}%
                        {selectedRadioSuggestionConfidenceTier ? ` (${selectedRadioSuggestionConfidenceTier})` : ''}
                      </p>
                    ) : null}
                    {!selectedRadioSuggestionAutoApplies ? (
                      <p className="panel__micro">
                        {isLegacyRadioGroupSuggestion(selectedRadioSuggestion)
                          ? 'Legacy checkbox-rule suggestion. Review and convert manually if this cluster is single-choice.'
                          : 'Below the auto-apply threshold. Review before converting this checkbox cluster into a radio group.'}
                      </p>
                    ) : null}
                    {selectedRadioSuggestion.reasoning ? (
                      <p className="panel__micro">{selectedRadioSuggestion.reasoning}</p>
                    ) : null}
                    <div className="panel__action-grid">
                      <button
                        className="ui-button ui-button--primary ui-button--compact"
                        type="button"
                        onClick={() => onApplyRadioSuggestion(selectedRadioSuggestion)}
                      >
                        Apply suggestion
                      </button>
                      <button
                        className="ui-button ui-button--ghost ui-button--compact"
                        type="button"
                        onClick={() => onDismissRadioSuggestion(selectedRadioSuggestion.id)}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="panel__section panel__section--divider">
            <details className="panel-disclosure">
              <summary className="panel-disclosure__summary panel-disclosure__summary--section">
                Create field
              </summary>
              <p className="panel__micro panel-disclosure__body">
                Pick a tool below, then drag on the page to draw a new field. The active tool stays selected
                until you click Off or press Esc. Tools are grouped by category &mdash; Universal AcroForm
                fields work in every PDF viewer, DullyPDF-only fields are template helpers we render at
                export{calculationsEnabled ? ', and Calculation fields are numeric inputs and formula outputs.' : '.'}
              </p>
            </details>
            <details className="panel-disclosure">
              <summary className="panel-disclosure__summary">Universal AcroForm fields</summary>
              <p className="panel__micro panel-disclosure__body">
                Text, signature, checkbox, and radio fields are standard PDF AcroForm types. Every PDF viewer
                &mdash; Adobe Reader, browsers, macOS Preview, mobile &mdash; renders and fills them natively,
                so exports work everywhere without DullyPDF in the loop.
              </p>
            </details>
            <div className="panel-display-modes" role="group" aria-label="Universal AcroForm create tools">
              {NATIVE_CREATE_TOOLS.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`panel-mode-chip${activeCreateTool === type ? ' panel-mode-chip--active' : ''}`}
                  onClick={() => onCreateToolChange(activeCreateTool === type ? null : type)}
                >
                  {createToolLabel(type)}
                </button>
              ))}
              <button
                type="button"
                className={`panel-mode-chip${activeCreateTool === null ? ' panel-mode-chip--active' : ''}`}
                onClick={() => onCreateToolChange(null)}
              >
                Off
              </button>
            </div>
            <details className="panel-disclosure">
              <summary className="panel-disclosure__summary">DullyPDF-only fields</summary>
              <p className="panel__micro panel-disclosure__body">
                Image, PDF417, barcode, and QR fields are DullyPDF template helpers, not native PDF form field
                types. Editable exports store them as tagged text fields so DullyPDF can recognize and restore
                them when the file is reopened. During final export or Fill by Link generation, DullyPDF renders
                the image, barcode, or QR output into the PDF page content.
              </p>
            </details>
            <div className="panel-display-modes" role="group" aria-label="DullyPDF-only create tools">
              {DULLYPDF_ONLY_CREATE_TOOLS.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`panel-mode-chip${activeCreateTool === type ? ' panel-mode-chip--active' : ''}`}
                  onClick={() => onCreateToolChange(activeCreateTool === type ? null : type)}
                >
                  {createToolLabel(type)}
                </button>
              ))}
              <button
                type="button"
                className={`panel-mode-chip${activeCreateTool === null ? ' panel-mode-chip--active' : ''}`}
                onClick={() => onCreateToolChange(null)}
              >
                Off
              </button>
            </div>
            {CALCULATION_CREATE_TOOLS.length ? (
              <div className="panel__section panel__section--tight panel__section--divider">
                <details className="panel-disclosure">
                  <summary className="panel-disclosure__summary">Calculation fields</summary>
                  <p className="panel__micro panel-disclosure__body">
                    Create numeric text fields and read-only calculated outputs. Live recalculation is
                    Adobe-first; other viewers keep the saved value.
                  </p>
                </details>
                <div className="panel-display-modes" role="group" aria-label="Calculation create tools">
                  {CALCULATION_CREATE_TOOLS.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`panel-mode-chip${activeCreateTool === type ? ' panel-mode-chip--active' : ''}`}
                      onClick={() => onCreateToolChange(activeCreateTool === type ? null : type)}
                    >
                      {createToolLabel(type)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="panel-mode-chip"
                    disabled={!selectedCanConvertToCalculation}
                    onClick={() => {
                      if (!selected) return;
                      onOpenCalculationSetup(selected.id, selected.calculation?.role === 'external_imported_calculation' ? 'review_imported' : 'convert');
                    }}
                  >
                    Convert
                  </button>
                  <button
                    type="button"
                    className={`panel-mode-chip${activeCreateTool === null ? ' panel-mode-chip--active' : ''}`}
                    onClick={() => onCreateToolChange(null)}
                  >
                    Off
                  </button>
                </div>
              </div>
            ) : null}
            {radioToolDraft && (activeCreateTool === 'radio' || activeCreateTool === 'quick-radio') ? (
              <div className="panel__section panel__section--tight panel__section--divider">
                <details className="panel-disclosure">
                  <summary className="panel-disclosure__summary panel-disclosure__summary--section">
                    {activeCreateTool === 'quick-radio' ? 'Quick Radio Group' : 'Radio Tool'}
                  </summary>
                  <p className="panel__micro panel-disclosure__body">
                    {activeCreateTool === 'quick-radio'
                      ? 'Drag a selection box around checkbox fields on the active page, review the selected fields, then convert them into one radio group. Hold Alt while dragging to include any checkbox the marquee touches.'
                      : 'Draw one radio option at a time. Each placement stays in this group until you switch tools or edit the group draft.'}
                  </p>
                </details>
                <label className="panel__label" htmlFor="radio-tool-group-label">
                  Group label
                </label>
                <input
                  id="radio-tool-group-label"
                  name="radio-tool-group-label"
                  className="panel__input"
                  value={radioToolDraft.groupLabel}
                  onChange={(event) => onUpdateRadioToolDraft({ groupLabel: event.target.value })}
                />
                <label className="panel__label" htmlFor="radio-tool-group-key">
                  Group key
                </label>
                <input
                  id="radio-tool-group-key"
                  name="radio-tool-group-key"
                  className="panel__input"
                  value={radioToolDraft.groupKey}
                  onChange={(event) => onUpdateRadioToolDraft({ groupKey: event.target.value })}
                />
                {activeCreateTool === 'radio' ? (
                  <>
                    <label className="panel__label" htmlFor="radio-tool-option-label">
                      Next option label
                    </label>
                    <input
                      id="radio-tool-option-label"
                      name="radio-tool-option-label"
                      className="panel__input"
                      value={radioToolDraft.nextOptionLabel}
                      onChange={(event) => onUpdateRadioToolDraft({ nextOptionLabel: event.target.value })}
                    />
                    <label className="panel__label" htmlFor="radio-tool-option-key">
                      Next option key
                    </label>
                    <input
                      id="radio-tool-option-key"
                      name="radio-tool-option-key"
                      className="panel__input"
                      value={radioToolDraft.nextOptionKey}
                      onChange={(event) => onUpdateRadioToolDraft({ nextOptionKey: event.target.value })}
                    />
                  </>
                ) : (
                  <>
                    <div className="panel__list panel__list--compact">
                      {pendingQuickRadioFields.length ? (
                        pendingQuickRadioFields.map((field) => (
                          <div key={field.id} className="panel-selection-row">
                            <span>{field.name}</span>
                            <button
                              className="panel-selection-row__remove"
                              type="button"
                              onClick={() => onRemovePendingQuickRadioField(field.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="panel__micro">No checkbox fields selected yet.</p>
                      )}
                    </div>
                    <div className="panel__action-grid">
                      <button
                        className="ui-button ui-button--ghost ui-button--compact"
                        type="button"
                        onClick={() => guardClick(pendingQuickRadioFields.length === 0, 'No checkbox fields selected to clear.', onCancelPendingQuickRadioSelection)}
                        aria-disabled={pendingQuickRadioFields.length === 0}
                      >
                        Clear selection
                      </button>
                      <button
                        className="ui-button ui-button--primary ui-button--compact"
                        type="button"
                        onClick={() => guardClick(pendingQuickRadioFields.length === 0, 'Select checkbox fields on the page first before converting.', onApplyPendingQuickRadioSelection)}
                        aria-disabled={pendingQuickRadioFields.length === 0}
                      >
                        Convert
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
            <div className="panel__section panel__section--tight panel__section--divider">
              <details className="panel-disclosure">
                <summary className="panel-disclosure__summary panel-disclosure__summary--section">
                  Bulk Convert Font
                </summary>
                <p className="panel__micro panel-disclosure__body">
                  Choose one text appearance setting, quick-select text fields on the active page, then apply
                  that setting to the selected fields. Hold Alt while dragging to include any field the marquee
                  touches.
                </p>
              </details>
              <label className="panel__label" htmlFor="bulk-text-style-property">
                Change
              </label>
              <select
                id="bulk-text-style-property"
                name="bulk-text-style-property"
                className="panel__select"
                value={bulkTextStyleProperty}
                onChange={(event) => setBulkTextStyleProperty(event.target.value as BulkTextStyleProperty)}
              >
                <option value="fontName">Font</option>
                <option value="fontSize">Font size</option>
                <option value="fontColor">Font color</option>
                <option value="textAlign">Alignment</option>
              </select>

              {bulkTextStyleProperty === 'fontName' ? (
                <div className="panel__row">
                  <label className="panel__label" htmlFor="bulk-text-style-font">
                    Bulk font
                  </label>
                  <select
                    id="bulk-text-style-font"
                    name="bulk-text-style-font"
                    className="panel__select"
                    value={bulkFontValue}
                    onChange={(event) => handleBulkFontChange(event.target.value)}
                  >
                    <option value="global">Use workspace ({globalFontLabel})</option>
                    {PDF_BASE_14_FONT_OPTION_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.advanced ? `${option.label} (symbol)` : option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ) : null}

              {bulkTextStyleProperty === 'fontSize' ? (
                <div className="panel__row">
                  <label className="panel__label" htmlFor="bulk-text-style-font-size">
                    Bulk font size
                  </label>
                  <div className="panel__inline-control">
                    <select
                      id="bulk-text-style-font-size"
                      name="bulk-text-style-font-size"
                      className="panel__select"
                      value={bulkFontSizeMode}
                      onChange={(event) => setBulkFontSizeMode(event.target.value as BulkFontSizeMode)}
                    >
                      <option value="global">Use workspace ({globalFontSizeLabel})</option>
                      <option value="auto">Auto</option>
                      <option value="custom">Custom</option>
                    </select>
                    <input
                      id="bulk-text-style-font-size-custom"
                      name="bulk-text-style-font-size-custom"
                      className="panel__input panel__input--inline"
                      type="number"
                      min={MIN_FIELD_FONT_SIZE_PT}
                      max={MAX_FIELD_FONT_SIZE_PT}
                      step={0.5}
                      inputMode="decimal"
                      aria-label="Bulk custom font size"
                      value={bulkFontSizeMode === 'custom' ? bulkFontSizeDraft : ''}
                      placeholder={globalFontSizeLabel}
                      disabled={bulkFontSizeMode !== 'custom'}
                      onChange={(event) => setBulkFontSizeDraft(event.target.value)}
                      onKeyDown={handleNumberInputKeyDown}
                    />
                  </div>
                </div>
              ) : null}

              {bulkTextStyleProperty === 'fontColor' ? (
                <div className="panel__row">
                  <label className="panel__label" htmlFor="bulk-text-style-font-color">
                    Bulk font color
                  </label>
                  <div className="panel__inline-control panel__inline-control--color">
                    <select
                      id="bulk-text-style-font-color"
                      name="bulk-text-style-font-color"
                      className="panel__select"
                      value={bulkFontColorMode}
                      onChange={(event) => setBulkFontColorMode(event.target.value as BulkFontColorMode)}
                    >
                      <option value="global">Use workspace ({globalFontColorLabel})</option>
                      <option value="custom">Custom</option>
                    </select>
                    <input
                      id="bulk-text-style-font-color-custom"
                      name="bulk-text-style-font-color-custom"
                      className="panel__color-input"
                      type="color"
                      aria-label="Bulk custom font color"
                      value={bulkFontColorDraft}
                      disabled={bulkFontColorMode !== 'custom'}
                      onChange={(event) => handleBulkFontColorChange(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {bulkTextStyleProperty === 'textAlign' ? (
                <div className="panel__row">
                  <label className="panel__label" htmlFor="bulk-text-style-alignment">
                    Bulk alignment
                  </label>
                  <select
                    id="bulk-text-style-alignment"
                    name="bulk-text-style-alignment"
                    className="panel__select"
                    value={bulkTextAlignmentValue}
                    onChange={(event) => handleBulkTextAlignmentChange(event.target.value)}
                  >
                    <option value="global">Use workspace ({globalTextAlignmentLabel})</option>
                    {FIELD_TEXT_ALIGNMENT_CHOICES.map((alignment) => (
                      <option key={alignment} value={alignment}>
                        {fieldTextAlignmentChoiceLabel(alignment)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <button
                type="button"
                className={`ui-button ${activeCreateTool === 'bulk-text-style' ? 'ui-button--primary' : 'ui-button--ghost'} ui-button--compact`}
                onClick={() => onCreateToolChange(activeCreateTool === 'bulk-text-style' ? null : 'bulk-text-style')}
              >
                Quick select text fields
              </button>
              <div className="panel__list panel__list--compact">
                {pendingBulkTextStyleFields.length ? (
                  pendingBulkTextStyleFields.map((field) => (
                    <div key={field.id} className="panel-selection-row">
                      <span>{field.name}</span>
                      <button
                        className="panel-selection-row__remove"
                        type="button"
                        onClick={() => onRemovePendingBulkTextStyleField(field.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="panel__micro">No text fields selected yet.</p>
                )}
              </div>
              <div className="panel__action-grid">
                <button
                  className="ui-button ui-button--ghost ui-button--compact"
                  type="button"
                  onClick={() => guardClick(pendingBulkTextStyleFields.length === 0, 'No text fields selected to clear.', onCancelPendingBulkTextStyleSelection)}
                  aria-disabled={pendingBulkTextStyleFields.length === 0}
                >
                  Clear selection
                </button>
                <button
                  className="ui-button ui-button--primary ui-button--compact"
                  type="button"
                  onClick={() => guardClick(pendingBulkTextStyleFields.length === 0, 'Select text fields on the page first before converting.', handleApplyBulkTextStyleSelection)}
                  aria-disabled={pendingBulkTextStyleFields.length === 0}
                >
                  Convert
                </button>
              </div>
            </div>
            <div className="panel__section panel__section--tight">
              <details className="panel-disclosure">
                <summary className="panel-disclosure__summary panel-disclosure__summary--section">
                  Keyboard Move
                </summary>
                <p className="panel__micro panel-disclosure__body">
                  When enabled, Arrow keys move the selected field by the configured step. Alt+Arrow nudges by
                  1 point, Shift+Alt+Arrow nudges by 10, and movement works from Edit mode.
                </p>
              </details>
              <label
                className={`panel-pill-toggle${arrowKeyMoveEnabled ? ' panel-pill-toggle--active' : ''}`}
                htmlFor="arrow-key-move-toggle"
              >
                <input
                  id="arrow-key-move-toggle"
                  type="checkbox"
                  checked={arrowKeyMoveEnabled}
                  onChange={(event) => onArrowKeyMoveEnabledChange(event.target.checked)}
                />
                <span>Arrow keys</span>
              </label>
              <div className="panel__inline-control">
                <label className="panel__label" htmlFor="arrow-key-move-step">
                  Step (pt)
                </label>
                <input
                  id="arrow-key-move-step"
                  name="arrow-key-move-step"
                  className="panel__input panel__input--inline"
                  type="number"
                  min={MIN_ARROW_KEY_MOVE_STEP}
                  max={MAX_ARROW_KEY_MOVE_STEP}
                  step={1}
                  inputMode="numeric"
                  value={arrowKeyMoveStepDraft}
                  onChange={(event) => setArrowKeyMoveStepDraft(event.target.value)}
                  onBlur={commitArrowKeyMoveStep}
                  onKeyDown={handleArrowKeyMoveStepKeyDown}
                />
              </div>
            </div>
            <details className="panel-disclosure">
              <summary className="panel-disclosure__summary panel-disclosure__summary--section">History</summary>
              <p className="panel__micro panel-disclosure__body">
                Undo or redo the last 10 field edits made in this workspace.
              </p>
            </details>
            <div className="panel__action-grid">
              <button
                className="ui-button ui-button--ghost ui-button--compact"
                type="button"
                onClick={() => guardClick(!canUndo, 'Nothing to undo.', onUndo)}
                aria-disabled={!canUndo}
              >
                Undo
              </button>
              <button
                className="ui-button ui-button--ghost ui-button--compact"
                type="button"
                onClick={() => guardClick(!canRedo, 'Nothing to redo.', onRedo)}
                aria-disabled={!canRedo}
              >
                Redo
              </button>
            </div>
          </div>

          <div className="panel__section panel__section--divider">
            <button
              className="ui-button ui-button--danger ui-button--compact"
              type="button"
              onClick={() => guardClick(fields.length === 0, 'No fields to delete.', () => setDeleteAllDialogOpen(true))}
              aria-disabled={fields.length === 0}
            >
              Delete all fields
            </button>
            <details className="panel-disclosure">
              <summary className="panel-disclosure__summary panel-disclosure__summary--section">Shortcuts</summary>
              <p className="panel__micro panel-disclosure__body">
                T/S/C/R/Q set create tools, Esc clears the active create tool, Delete/Backspace deletes the
                selected field, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes, Ctrl/Cmd+F or /
                focuses search, [ and ] change pages, Arrow moves the selected field when Keyboard Move is
                enabled, Alt+Arrow nudges by 1 point, Shift+Alt+Arrow nudges by 10, and Shift during
                corner-resize locks aspect ratio.
              </p>
            </details>
          </div>
        </div>
      </aside>
      <ConfirmDialog
        open={deleteAllDialogOpen}
        title="Delete all fields"
        description="Are you sure you want to delete all fields?"
        confirmLabel="Yes"
        cancelLabel="No"
        tone="danger"
        onConfirm={handleDeleteAllFieldsConfirm}
        onCancel={() => setDeleteAllDialogOpen(false)}
      />
    </>
  );
}
