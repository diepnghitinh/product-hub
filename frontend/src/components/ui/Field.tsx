import type { ReactNode } from 'react';
import { Label } from './Label';

interface FieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}

/** Label + control + error message, spaced consistently. */
export function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div className="mb-4 space-y-1.5 last:mb-0">
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
