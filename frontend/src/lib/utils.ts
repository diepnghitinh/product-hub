import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with clsx and resolve Tailwind conflicts with tailwind-merge.
 * This is the standard shadcn/ui `cn` helper used by every UI component.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Structural equality for plain JSON-ish values (primitives, arrays, plain
 * objects). Used to tell whether a settings form still matches what was saved,
 * so a Save button can stay disabled until something actually changes. Arrays
 * are order-sensitive (reordering *is* a change); object key order is not.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  const aArray = Array.isArray(a);
  if (aArray !== Array.isArray(b)) return false;
  if (aArray) {
    const bArr = b as unknown[];
    return (a as unknown[]).length === bArr.length && (a as unknown[]).every((v, i) => deepEqual(v, bArr[i]));
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  if (aKeys.length !== Object.keys(bo).length) return false;
  return aKeys.every(
    (k) => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]),
  );
}
