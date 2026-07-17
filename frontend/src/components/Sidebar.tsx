import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { Menu } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from '@/lib/nav';
import { t } from '@/i18n';
import { ROLE_LABEL } from '@/types/enums';
import { useInbox } from '@/features/inbox/api';

const COLLAPSE_KEY = 'ph_nav_collapsed';

function initials(name: string, email: string): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

interface SidebarProps {
  /** Whether the mobile drawer is open. */
  mobileOpen: boolean;
  /** Close the mobile drawer (also fired on any nav click). */
  onCloseMobile: () => void;
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { user, logout, isAdmin } = useAuth();
  const { toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { data: inbox } = useInbox();
  const unseen = inbox?.unseenCount ?? 0;

  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
  );
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  function onLogout() {
    logout();
    navigate('/login');
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex h-[100dvh] w-[216px] flex-col border-r bg-sidebar text-sidebar-foreground shadow-xl transition-[width,transform] duration-200',
        'md:sticky md:top-0 md:z-30 md:translate-x-0 md:shadow-none',
        collapsed ? 'md:w-14' : 'md:w-[216px]',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      {/* Brand row */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-2.5">
        <Link
          to="/"
          onClick={onCloseMobile}
          className={cn(
            'flex items-center gap-1.5 overflow-hidden text-sm font-semibold tracking-tight',
            collapsed && 'md:hidden',
          )}
        >
          <span className="shrink-0 text-base text-primary">◑</span>
          <span className="truncate">{t('app.name')}</span>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          className={cn(
            'hidden size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:grid',
            collapsed ? 'md:mx-auto' : 'ml-auto',
          )}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto p-2">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={group.headingKey} className="flex flex-col gap-0.5">
              <span
                className={cn(
                  'px-2 pb-0.5 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground',
                  collapsed && 'md:hidden',
                )}
              >
                {t(group.headingKey)}
              </span>
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onClick={onCloseMobile}
                  title={collapsed ? t(item.labelKey) : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
                      collapsed && 'md:justify-center md:gap-0',
                    )
                  }
                >
                  <span className="grid shrink-0 place-items-center">
                    <Icon name={item.icon} size={16} />
                  </span>
                  <span className={cn('flex-1 truncate', collapsed && 'md:hidden')}>
                    {t(item.labelKey)}
                  </span>
                  {item.badge === 'inbox' && unseen > 0 && (
                    <span
                      className={cn(
                        'ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground',
                        collapsed && 'md:hidden',
                      )}
                    >
                      {unseen}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      {/* Footer user menu */}
      {user && (
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <Menu
            up
            align="left"
            triggerClassName="w-full"
            trigger={
              <span
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-sidebar-accent',
                  collapsed && 'md:justify-center',
                )}
              >
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                  aria-hidden
                >
                  {initials(user.name, user.email)}
                </span>
                <span
                  className={cn(
                    'flex min-w-0 flex-col leading-tight',
                    collapsed && 'md:hidden',
                  )}
                >
                  <span className="truncate text-[13px] font-medium text-foreground">
                    {user.name}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {ROLE_LABEL[user.role]}
                  </span>
                </span>
              </span>
            }
            items={[
              { label: t('theme.toggle'), onClick: toggleTheme },
              {
                label: t('nav.designPatterns'),
                onClick: () => {
                  navigate('/design-patterns');
                  onCloseMobile();
                },
              },
              { label: t('nav.signOut'), onClick: onLogout, danger: true },
            ]}
          />
        </div>
      )}
    </aside>
  );
}
