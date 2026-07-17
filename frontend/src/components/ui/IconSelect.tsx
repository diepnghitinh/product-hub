import { Icon, type IconName } from '@/components/Icon';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from './dropdown-menu';

export interface IconSelectProps {
  value: IconName;
  options: readonly IconName[];
  onChange: (value: IconName) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Symbol picker: a square trigger showing the current icon, opening a grid of
 * choices. Icons are monochrome and inherit `currentColor`, so a picked symbol
 * still follows its surroundings' hover/active colour.
 */
export function IconSelect({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
  className,
}: IconSelectProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
        >
          <Icon name={value} size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent align="start" className="w-auto p-2">
          <div className="grid grid-cols-6 gap-1">
            {options.map((name) => (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={name === value}
                onClick={() => onChange(name)}
                className={cn(
                  'grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  name === value && 'bg-accent text-foreground ring-1 ring-primary',
                )}
              >
                <Icon name={name} size={16} />
              </button>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  );
}
