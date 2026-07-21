/**
 * Team-defined custom fields (Jira/ClickUp-style). A team declares its own fields;
 * each task/bug then stores a value per field keyed by the stable `id` (which never
 * changes once items reference it — name/options/required stay editable). Mirrors
 * how per-team statuses and {@link TaskLabelConfig} are owned by the team.
 */
export enum CustomFieldType {
  TEXT = 'text',
  NUMBER = 'number',
  SELECT = 'select',
  DATE = 'date',
  CHECKBOX = 'checkbox',
}

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = [
  CustomFieldType.TEXT,
  CustomFieldType.NUMBER,
  CustomFieldType.SELECT,
  CustomFieldType.DATE,
  CustomFieldType.CHECKBOX,
];

/** True when the field type carries a fixed option list (only `select` does). */
export function fieldTypeHasOptions(type: CustomFieldType): boolean {
  return type === CustomFieldType.SELECT;
}

export interface CustomFieldConfig {
  /** Stable id stored in each item's value map; never changes once in use. */
  id: string;
  name: string;
  type: CustomFieldType;
  /** Choices for a `select` field; absent for every other type. */
  options?: string[];
  /** When true, the item flags an empty value (soft-required on the detail panel). */
  required?: boolean;
}

/**
 * A stored value for one custom field on a task/bug. `date` is an ISO `YYYY-MM-DD`
 * string (same convention as a task's dueDate), `select` stores the chosen option,
 * `checkbox` a boolean, `number` a number, `text` a string.
 */
export type CustomFieldValue = string | number | boolean;
