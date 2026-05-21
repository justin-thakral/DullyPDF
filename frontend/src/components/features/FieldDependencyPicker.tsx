import { useEffect, useMemo, useRef, useState } from 'react';
import type { PdfField } from '../../types';
import './FieldDependencyPicker.css';

export type FieldDependencyPickerOption = {
  field: PdfField;
  label: string;
  meta?: string;
  disabledReason?: string | null;
  searchText?: string;
};

type FieldDependencyPickerProps = {
  label: string;
  placeholder: string;
  options: FieldDependencyPickerOption[];
  selectedFieldId: string;
  onSelect: (field: PdfField | null) => void;
  emptyMessage: string;
  noMatchesMessage: string;
  clearLabel: string;
  className?: string;
};

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function searchableText(option: FieldDependencyPickerOption): string {
  return [
    option.label,
    option.meta,
    option.disabledReason,
    option.searchText,
    option.field.id,
    option.field.name,
    `page ${option.field.page}`,
  ].filter(Boolean).join(' ');
}

export function FieldDependencyPicker({
  label,
  placeholder,
  options,
  selectedFieldId,
  onSelect,
  emptyMessage,
  noMatchesMessage,
  clearLabel,
  className,
}: FieldDependencyPickerProps) {
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = useMemo(
    () => options.find((option) => option.field.id === selectedFieldId) ?? null,
    [options, selectedFieldId],
  );
  const queryTokens = useMemo(
    () => normalizeSearchText(query).split(/\s+/).filter(Boolean),
    [query],
  );
  const filteredOptions = useMemo(() => {
    if (!queryTokens.length) return options;
    return options.filter((option) => {
      const optionText = normalizeSearchText(searchableText(option));
      return queryTokens.every((token) => optionText.includes(token));
    });
  }, [options, queryTokens]);
  const rootClassName = ['field-dependency-picker', className].filter(Boolean).join(' ');

  useEffect(() => {
    if (!queryTokens.length || filteredOptions.length === 0) return;
    if (typeof listRef.current?.scrollIntoView !== 'function') return;
    listRef.current.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [filteredOptions.length, queryTokens.length]);

  return (
    <div className={rootClassName}>
      <label className="field-dependency-picker__label">
        <span>{label}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      <div className="field-dependency-picker__status">
        <span>
          {selectedOption ? (
            <>
              Selected: <strong>{selectedOption.label}</strong>
            </>
          ) : (
            'No field selected'
          )}
        </span>
        {selectedOption ? (
          <button
            type="button"
            className="field-dependency-picker__clear"
            onClick={() => onSelect(null)}
          >
            {clearLabel}
          </button>
        ) : null}
      </div>
      <div ref={listRef} className="field-dependency-picker__list" role="listbox" aria-label={`${label} options`}>
        {options.length === 0 ? (
          <p className="field-dependency-picker__empty">{emptyMessage}</p>
        ) : filteredOptions.length === 0 ? (
          <p className="field-dependency-picker__empty">{noMatchesMessage}</p>
        ) : (
          filteredOptions.map((option) => {
            const selected = option.field.id === selectedFieldId;
            const disabled = Boolean(option.disabledReason);
            return (
              <button
                key={option.field.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                title={option.disabledReason || undefined}
                className={[
                  'field-dependency-picker__option',
                  selected ? 'field-dependency-picker__option--selected' : '',
                  disabled ? 'field-dependency-picker__option--disabled' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  onSelect(option.field);
                  setQuery('');
                }}
              >
                <span className="field-dependency-picker__option-label">{option.label}</span>
                {option.disabledReason ? (
                  <span className="field-dependency-picker__option-meta">{option.disabledReason}</span>
                ) : option.meta ? (
                  <span className="field-dependency-picker__option-meta">{option.meta}</span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default FieldDependencyPicker;
