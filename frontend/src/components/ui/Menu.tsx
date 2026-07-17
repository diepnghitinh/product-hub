import { useRef, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /**
   * Close the menu and let the action keep whatever focus it takes — for
   * actions that hand focus somewhere else, like opening an inline editor.
   *
   * Off by default: items that toggle a value in place (pin, environment) keep
   * the menu open so you can see the change land, and closing normally returns
   * focus to the trigger, which is what keyboard users want.
   */
  closeOnSelect?: boolean;
}

interface MenuProps {
  /** The clickable trigger (usually a kebab icon). */
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
  /** Open upward (for triggers near the bottom of the viewport). */
  up?: boolean;
  /** Extra class on the trigger. */
  triggerClassName?: string;
}

/** Dropdown menu backed by Radix (keyboard nav, focus management, portal). */
export function Menu({
  trigger,
  items,
  align = 'right',
  up = false,
  triggerClassName = '',
}: MenuProps) {
  // Set when a `closeOnSelect` item runs, so the close that follows doesn't
  // drag focus back to the trigger. The menu unmounts only after its exit
  // animation, well after the action has focused whatever it opened — without
  // this, that late focus-return silently blurs the new field.
  const yieldFocus = useRef(false);

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        // Fresh open, fresh intent — so a dismiss (Escape, click-away) still
        // returns focus to the trigger the normal way.
        if (open) yieldFocus.current = false;
      }}
    >
      <DropdownMenu.Trigger
        className={cn(
          'inline-flex cursor-pointer items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          triggerClassName,
        )}
      >
        {trigger}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align === 'right' ? 'end' : 'start'}
          side={up ? 'top' : 'bottom'}
          sideOffset={6}
          // The content is portaled out to the body, but React still bubbles
          // synthetic events up the *component* tree — so without this, picking
          // an item also fires the onClick of whatever clickable card the menu
          // is nested in (the project cards navigate on click).
          onClick={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => {
            if (yieldFocus.current) e.preventDefault();
          }}
          className="z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {items.map((item, i) => (
            <DropdownMenu.Item
              key={i}
              disabled={item.disabled}
              onSelect={(e) => {
                if (item.closeOnSelect) yieldFocus.current = true;
                else e.preventDefault();
                item.onClick();
              }}
              className={cn(
                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                item.danger &&
                  'text-destructive focus:bg-destructive focus:text-destructive-foreground',
              )}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
