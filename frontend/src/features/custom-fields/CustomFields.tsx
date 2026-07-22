import { Calendar, Hash, List, SquareCheck, Type } from 'lucide-react';
import { Checkbox, DatePicker, Input, Select } from '@/components/ui';
import { PropField } from '@/features/issues/IssueDetail';
import { t } from '@/i18n';
import { CustomFieldType, type CustomFieldConfig, type CustomFieldValue } from '@/types/enums';

/** The icon-led sidebar row for a custom field is keyed off its type. */
function fieldIcon(type: CustomFieldType) {
  switch (type) {
    case CustomFieldType.NUMBER:
      return <Hash />;
    case CustomFieldType.SELECT:
      return <List />;
    case CustomFieldType.DATE:
      return <Calendar />;
    case CustomFieldType.CHECKBOX:
      return <SquareCheck />;
    case CustomFieldType.TEXT:
    default:
      return <Type />;
  }
}

/** A field with no value set (a checkbox is "missing" only when required + unchecked). */
function isEmpty(value: CustomFieldValue | undefined): boolean {
  return value === undefined || value === '' || value === null;
}
function isMissing(field: CustomFieldConfig, value: CustomFieldValue | undefined): boolean {
  if (!field.required) return false;
  if (field.type === CustomFieldType.CHECKBOX) return value !== true;
  return isEmpty(value);
}

export interface CustomFieldsProps {
  /** The team's field definitions (from `team.customFields`). */
  fields: CustomFieldConfig[];
  /** The item's stored values, keyed by field id. */
  values: Record<string, CustomFieldValue>;
  canWrite: boolean;
  /** Called with the full next value map (an unset field drops its key). */
  onChange: (next: Record<string, CustomFieldValue>) => void;
}

/**
 * Renders a team's custom fields as PropField rows in an item's Properties sidebar
 * (one row per field, the right input for its type). Empty values are stored by
 * dropping the key; a required field flags an empty value inline. Read-only shows
 * the value. Renders nothing when the team has no fields.
 */
export function CustomFields({ fields, values, canWrite, onChange }: CustomFieldsProps) {
  if (fields.length === 0) return null;

  const setValue = (id: string, value: CustomFieldValue | undefined) => {
    const next = { ...values };
    if (value === undefined || value === '') delete next[id];
    else next[id] = value;
    onChange(next);
  };

  return (
    <>
      {fields.map((field) => {
        const value = values[field.id];
        const missing = isMissing(field, value);
        const label = field.required ? `${field.name} *` : field.name;
        return (
          <PropField key={field.id} label={label} icon={fieldIcon(field.type)}>
            {canWrite ? (
              <div className="space-y-1">
                <FieldControl
                  field={field}
                  value={value}
                  invalid={missing}
                  onChange={(v) => setValue(field.id, v)}
                />
                {missing && (
                  <p className="text-xs text-destructive">{t('customFields.requiredValue')}</p>
                )}
              </div>
            ) : (
              <FieldValueDisplay field={field} value={value} />
            )}
          </PropField>
        );
      })}
    </>
  );
}

function FieldControl({
  field,
  value,
  invalid,
  onChange,
}: {
  field: CustomFieldConfig;
  value: CustomFieldValue | undefined;
  invalid: boolean;
  onChange: (value: CustomFieldValue | undefined) => void;
}) {
  switch (field.type) {
    case CustomFieldType.NUMBER:
      return (
        <Input
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          aria-invalid={invalid}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(undefined);
            const n = Number(raw);
            if (!Number.isNaN(n)) onChange(n);
          }}
        />
      );
    case CustomFieldType.SELECT:
      return (
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onChange(v || undefined)}
          aria-invalid={invalid}
          options={[
            { value: '', label: t('customFields.selectPlaceholder') },
            ...(field.options ?? []).map((o) => ({ value: o, label: o })),
          ]}
        />
      );
    case CustomFieldType.DATE:
      return (
        <DatePicker
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => onChange(v || undefined)}
          aria-invalid={invalid}
        />
      );
    case CustomFieldType.CHECKBOX:
      return (
        <Checkbox
          checked={value === true}
          onCheckedChange={(c) => onChange(c === true)}
        />
      );
    case CustomFieldType.TEXT:
    default:
      return (
        <Input
          value={typeof value === 'string' ? value : value === undefined ? '' : String(value)}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function FieldValueDisplay({
  field,
  value,
}: {
  field: CustomFieldConfig;
  value: CustomFieldValue | undefined;
}) {
  if (field.type === CustomFieldType.CHECKBOX) {
    return <span className="text-sm">{value === true ? t('common.yes') : t('common.no')}</span>;
  }
  if (isEmpty(value)) return <span className="text-sm text-muted-foreground">—</span>;
  return <span className="text-sm">{String(value)}</span>;
}
