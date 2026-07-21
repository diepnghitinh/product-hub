import { useRef, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  /** Action for a leaf item. Omit when `children` is set (it opens a submenu). */
  onClick?: () => void;
  /** Optional leading glyph (e.g. a lucide icon) shown before the label. */
  icon?: ReactNode;
  /** Nested items — renders `label` as a submenu trigger (▸), not an action. */
  children?: MenuItem[];
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

// One popover surface, reused by the root menu and every submenu.
const SURFACE =
  'z-50 min-w-[11rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';
// One row style, shared by leaf items and submenu triggers.
const ROW =
  'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50';
const DANGER = 'text-destructive focus:bg-destructive focus:text-destructive-foreground';

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

  const glyph = (icon: ReactNode) => (
    <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
      {icon}
    </span>
  );

  const renderItem = (item: MenuItem, key: string): ReactNode => {
    // A parent item opens a nested submenu (e.g. "Mark as ▸").
    if (item.children?.length) {
      return (
        <DropdownMenu.Sub key={key}>
          <DropdownMenu.SubTrigger disabled={item.disabled} className={cn(ROW, item.danger && DANGER)}>
            {item.icon && glyph(item.icon)}
            <span className="flex-1">{item.label}</span>
            <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal>
            <DropdownMenu.SubContent sideOffset={4} className={SURFACE}>
              {item.children.map((child, j) => renderItem(child, `${key}.${j}`))}
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Sub>
      );
    }
    return (
      <DropdownMenu.Item
        key={key}
        disabled={item.disabled}
        onSelect={(e) => {
          if (item.closeOnSelect) yieldFocus.current = true;
          else e.preventDefault();
          item.onClick?.();
        }}
        className={cn(ROW, item.danger && DANGER)}
      >
        {item.icon && glyph(item.icon)}
        {item.label}
      </DropdownMenu.Item>
    );
  };

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
          className={SURFACE}
        >
          {items.map((item, i) => renderItem(item, String(i)))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
