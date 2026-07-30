import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import { LogOut, Moon, Sun, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useNavStyle } from '@/lib/navStyle';
import { Separator } from '@/components/ui';
import { UserAvatar } from '@/components/UserAvatar';
import { Icon } from '@/components/Icon';
import { PrefRow } from '@/layouts/sidebar/prefs';
import { NAV_FOOTER_CELL } from '@/layouts/sidebar/navPrimitives';
import { PROFILE_NAV_ITEMS } from '@/layouts/sidebar/classicMenuConfig';
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
 *
 * Mostly *personal*: who I am, how the app looks to me, and signing out. The one
 * exception is workspace admin (People, Settings), which the two-level menu lists
 * under **More** and the classic menu has no home for — so those two rows appear
 * here only while the classic menu is on. Either way each is reachable from
 * exactly one place.
 *
 * It is also the only surface *both* menus render, which is why the side-menu
 * switch lives here: pick the classic menu and the way back is still in the same
 * corner of the screen.
 */
export function ProfileMenu({
  compact,
  onCloseMobile,
  className,
}: {
  /**
   * Show the avatar alone instead of avatar + name. `true` at every width — the
   * placement in the two-level menu's 68px icon rail, which is narrow on mobile
   * too. `'md'` from `md` up only, for the classic menu's collapsed rail: its
   * mobile drawer is full width, so there the name still fits.
   */
  compact?: boolean | 'md';
  onCloseMobile: () => void;
  className?: string;
}) {
  const { user, logout, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const { navStyle, setNavStyle } = useNavStyle();
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

  // Link rows. Kept next to the render so the icon travels with the label.
  // People/Settings ride along only in the classic menu, which has no group for
  // them; the two-level menu shows them under More instead.
  const rows: { icon: ReactNode; label: string; path: string }[] = [
    {
      icon: <User className="size-4 shrink-0 text-muted-foreground" />,
      label: t('profile.myProfile'),
      path: '/profile',
    },
    ...(navStyle === 'classic'
      ? PROFILE_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => ({
          icon: <Icon name={item.icon} size={16} className="shrink-0 text-muted-foreground" />,
          label: t(item.labelKey),
          path: item.path,
        }))
      : []),
  ];

  return (
    <div
      className={cn(
        NAV_FOOTER_CELL,
        compact === true && 'justify-center',
        compact === 'md' && 'md:justify-center',
        className,
      )}
    >
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            /* Not `nav.menu` — that's the topbar's hamburger, and two controls
               answering to "Menu" is ambiguous to anyone navigating by name. */
            aria-label={t('profile.accountMenu')}
            className={cn(
              'flex items-center gap-2 rounded-md text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring',
              // Sized to sit *inside* the footer cell, not to define it. Compact
              // takes the same 32px box as the collapse toggle above it, so the
              // two controls in the rail line up.
              compact === true ? 'size-8 justify-center' : 'h-9 w-full px-1.5',
              compact === 'md' && 'md:size-8 md:justify-center md:px-0',
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
              className={cn(
                'flex min-w-0 flex-col leading-tight',
                compact === true && 'hidden',
                compact === 'md' && 'md:hidden',
              )}
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

            {/* The browser-level preferences, one line each: how the app looks,
                which side menu it uses, and what language it reads in. None is
                an account field, so none belongs on the profile page. */}
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
              {/* Switches the whole shell on the spot, no reload — and the menu
                  you land in has this same row in the same corner, so the choice
                  is never one-way. */}
              <PrefRow
                label={t('profile.sideMenu')}
                hint={t('profile.sideMenuHint')}
                value={navStyle}
                onChange={setNavStyle}
                options={[
                  { value: 'two-level', label: t('navstyle.twoLevel') },
                  { value: 'classic', label: t('navstyle.classic') },
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
              {rows.map(({ icon, label, path }) => (
                <button key={path} type="button" onClick={() => go(path)} className={ROW}>
                  {icon}
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
