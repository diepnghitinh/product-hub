import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENVIRONMENT_LABEL, ProjectEnvironment } from '@/types/enums';

/** Dot color per environment — mirrors EnvironmentBadge (dev=grey, staging=amber, prod=green). */
const ENV_DOT: Record<ProjectEnvironment, string> = {
  [ProjectEnvironment.DEVELOPMENT]: 'bg-muted-foreground',
  [ProjectEnvironment.STAGING]: 'bg-warning',
  [ProjectEnvironment.PRODUCTION]: 'bg-success',
};

interface EnvironmentSelectProps {
  id?: string;
  value: ProjectEnvironment;
  onChange: (value: ProjectEnvironment) => void;
  disabled?: boolean;
}

/**
 * Environment picker built on Radix Select so each item can carry its own
 * colour dot (native <option> can't be styled reliably across browsers).
 */
export function EnvironmentSelect({
  id,
  value,
  onChange,
  disabled,
}: EnvironmentSelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as ProjectEnvironment)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className="flex items-center gap-2">
          <span
            className={cn('size-2 shrink-0 rounded-full', ENV_DOT[value])}
            aria-hidden
          />
          <SelectPrimitive.Value />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'relative z-50 max-h-96 min-w-[8rem] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {Object.values(ProjectEnvironment).map((env) => (
              <SelectPrimitive.Item
                key={env}
                value={env}
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                )}
              >
                <span
                  className={cn('size-2 shrink-0 rounded-full', ENV_DOT[env])}
                  aria-hidden
                />
                <SelectPrimitive.ItemText>
                  {ENVIRONMENT_LABEL[env]}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                  <Check className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
