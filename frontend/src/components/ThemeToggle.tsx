import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

/** A sun/moon button that flips between light and dark. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={cn(
        'inline-grid size-8 place-items-center rounded-md border border-transparent bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        className,
      )}
      onClick={toggle}
      aria-label={t('theme.toggle')}
      title={t('theme.toggle')}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
