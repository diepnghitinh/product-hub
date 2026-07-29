import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import { LogOut, Moon, Settings, Sun, User, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { Separator } from '@/components/ui';
import { UserAvatar } from '@/components/UserAvatar';
import { PrefRow } from '@/layouts/sidebar/prefs';
import { cn } from '@/lib/utils';
import { ROLE_LABEL } from '@/types/enums';
import { getLocale, LOCALES, setLocale, t } from '@/i18n';

/** A row in the menu's link list — the same rhythm as the sidebar's own rows. */
const ROW =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-popover-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent';

/**
 * The signed-in user's menu, anchored to the sidebar footer. A Radix Popover
 * (not the flat `Menu`) so it can hold real sections — an identity header, the
 * per-browser preferences, link rows and a destructive sign-out — the way the
 * design concept lays them out. Opens upward, since it lives at the bottom.
 *
 * Owns the footer chrome itself (border + padding) and renders nothing when
 * signed out, so both sidebars just drop it in.
 */
export function ProfileMenu({
  collapsed,
  onCloseMobile,
}: {
  /** Collapsed to the icon rail: label hidden from `md` up, where it narrows. */
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
            /* Not `nav.menu` — that's the topbar's hamburger, and two controls
               answering to "Menu" is ambiguous to anyone navigating by name. */
            aria-label={t('profile.accountMenu')}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring',
              collapsed && 'md:justify-center',
            )}
          >
            <UserAvatar
              name={user.name}
              email={user.email}
              src={user.avatarUrl}
              className="size-7"
              fallbackClassName="text-[10px]"
            />
            <span
              className={cn('flex min-w-0 flex-col leading-tight', collapsed && 'md:hidden')}
            >
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
              <UserAvatar
                name={user.name}
                email={user.email}
                src={user.avatarUrl}
                className="size-9"
                fallbackClassName="text-xs"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
              </div>
            </div>

            <Separator />

            {/* The browser-level preferences, one line each: how the app looks
                and what language it reads in. Neither is an account field, so
                neither belongs on the profile page. */}
            <div className="py-1.5">
              <PrefRow
                label={t('profile.appearance')}
                value={theme}
                onChange={setTheme}
                iconOnly
                options={[
                  { value: 'light', label: t('theme.light'), glyph: <Sun className="size-3.5" /> },
                  { value: 'dark', label: t('theme.dark'), glyph: <Moon className="size-3.5" /> },
                ]}
              />
              {/* Each language is written in its own words (한국어, not "Korean"),
                  so the option a reader is looking for is legible to them even
                  while the rest of the menu is in a language they don't read. */}
              <PrefRow
                label={t('profile.language')}
                hint={t('profile.languageHint')}
                value={getLocale()}
                onChange={setLocale}
                options={LOCALES.map((l) => ({ value: l.value, label: l.label }))}
              />
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
