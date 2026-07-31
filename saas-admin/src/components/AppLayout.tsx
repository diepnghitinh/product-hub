import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Building2,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Sun,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/tenants', label: 'Workspaces', icon: Building2 },
  { to: '/plans', label: 'Plans', icon: Package },
  { to: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/usage', label: 'Usage', icon: Gauge },
];

/**
 * The console shell: a permanent sidebar from `lg` up, a slide-over below it.
 *
 * The sidebar uses the `--sidebar-*` tokens rather than a hue of its own — this
 * is the same product, and inventing a second palette for the back office is how
 * two apps stop looking related.
 */
export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { admin, logout } = useAuth();
  const { theme, toggle } = useTheme();

  // Navigating on mobile should close the drawer, or the new page is hidden
  // behind it.
  useEffect(() => setOpen(false), [location.pathname]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 p-3">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )
          }
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
        ph
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-none text-sidebar-foreground">
          product-hub
        </p>
        <p className="mt-0.5 truncate text-[11px] leading-none text-sidebar-foreground/60">
          Platform console
        </p>
      </div>
    </div>
  );

  const footer = (
    <div className="shrink-0 border-t border-sidebar-border p-3">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
          {admin ? initials(admin.name) : '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight text-sidebar-foreground">
            {admin?.name}
          </p>
          <p className="truncate text-xs leading-tight text-sidebar-foreground/60">
            {admin?.email}
          </p>
        </div>
      </div>
      <div className="mt-2 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="flex-1 justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? 'Light' : 'Dark'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className="flex-1 justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Permanent sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Slide-over sidebar */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-xl">
            <div className="flex items-center justify-between border-b border-sidebar-border pr-2">
              <div className="flex-1">{brand}</div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="text-sidebar-foreground/70"
              >
                <X />
              </Button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 lg:hidden">
          <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
          <span className="text-sm font-semibold">Platform console</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
