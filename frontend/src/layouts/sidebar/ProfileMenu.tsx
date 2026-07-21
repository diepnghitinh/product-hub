import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import { LogOut, Moon, Settings, Sun, User, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme, type Theme } from '@/lib/theme';
import { Separator } from '@/components/ui';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';
import { ROLE_LABEL } from '@/types/enums';
import { t } from '@/i18n';

/** A row in the menu's link list — the same rhythm as the sidebar's own rows. */
const ROW =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-popover-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent';

/**
 * The signed-in user's menu, anchored to the sidebar footer. A Radix Popover
 * (not the flat `Menu`) so it can hold real sections — an identity header, an
 * appearance switch, link rows and a destructive sign-out — the way the design
 * concept lays them out. Opens upward, since it lives at the bottom of the rail.
 *
 * Owns the footer chrome itself (border + padding) and renders nothing when
 * signed out, so `Sidebar` just drops it in.
 */
export function ProfileMenu({
  collapsed,
  onCloseMobile,
}: {
  collapsed: boolean;
  onCloseMobile: () => void;
}) {
  const { user, isAdmin, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  // Navigating closes the panel and the mobile drawer both.
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
    onCloseMobile();
  };
  const onLogout = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  // Link rows. Kept next to the render so the icon travels with the label; the
  // admin-only ones fall away for everyone else (mirrors the People/Settings
  // gate the sidebar used before they moved in here).
  const rows = [
    { icon: User, label: t('profile.myProfile'), path: '/profile', show: true },
    { icon: Users, label: t('profile.managePeople'), path: '/admin/people', show: isAdmin },
    { icon: Settings, label: t('nav.settings'), path: '/admin/settings', show: isAdmin },
  ].filter((r) => r.show);

  return (
    <div className="shrink-0 border-t border-sidebar-border p-2">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={t('nav.menu')}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring',
              collapsed && 'md:justify-center',
            )}
          >
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
              aria-hidden
            >
              {initials(user.name, user.email)}
            </span>
            <span className={cn('flex min-w-0 flex-col leading-tight', collapsed && 'md:hidden')}>
              <span className="truncate text-[13px] font-medium text-foreground">{user.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {ROLE_LABEL[user.role]}
              </span>
            </span>
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={8}
            className="z-50 w-64 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            {/* Identity — avatar + name + role, echoing the trigger. */}
            <div className="flex items-center gap-3 p-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                aria-hidden
              >
                {initials(user.name, user.email)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>

            <Separator />

            {/* Appearance — a segmented Light / Dark switch on the current theme. */}
            <div className="p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t('profile.appearance')}
              </p>
              <div className="inline-flex w-full rounded-lg bg-muted p-1">
                {(
                  [
                    { value: 'light', label: t('theme.light'), Icon: Sun },
                    { value: 'dark', label: t('theme.dark'), Icon: Moon },
                  ] as { value: Theme; label: string; Icon: typeof Sun }[]
                ).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    aria-pressed={theme === value}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      theme === value
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Links */}
            <div className="p-1.5">
              {rows.map(({ icon: RowIcon, label, path }) => (
                <button key={path} type="button" onClick={() => go(path)} className={ROW}>
                  <RowIcon className="size-4 shrink-0 text-muted-foreground" />
                  {label}
                </button>
              ))}
            </div>

            <Separator />

            {/* Sign out — destructive, so it reads apart from the links above. */}
            <div className="p-1.5">
              <button
                type="button"
                onClick={onLogout}
                className={cn(ROW, 'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10')}
              >
                <LogOut className="size-4 shrink-0" />
                {t('profile.logout')}
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
